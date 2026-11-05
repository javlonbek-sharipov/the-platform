/**
 * Where the Atlas is, and which files it has: the config marks the repo root,
 * and git's view of the repo, or a walk of its folders, finds the Diagrams.
 */

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, realpathSync, symlinkSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

export const moduleSuffix = ".diagram.ts";
export const svgSuffix = ".diagram.svg";

const run = promisify(execFile);

/** The config file, at the repo root. It marks the Atlas. */
export const configFile = "diagrams.config.ts";

/** A problem that stops a command before it checks any Diagram, such as a missing config. */
export class AtlasError extends Error {}

/**
 * The repo root: the nearest folder at or above `cwd` that holds the config.
 */
export function findRoot(cwd: string): string {
	for (let folder = resolve(cwd); ; folder = dirname(folder)) {
		if (existsSync(join(folder, configFile))) {
			return folder;
		}
		if (dirname(folder) === folder) {
			throw new AtlasError(
				`There's no ${configFile} in this folder or any folder above it. It marks the Atlas, so create it at the repo root:\n\n` +
					'  import { atlas } from "@the-platform/diagrams";\n\n' +
					"  export default atlas({});",
			);
		}
	}
}

/** The files of the Atlas, each list in path order. */
export interface AtlasFiles {
	/** Every diagram module, `*.diagram.ts`. */
	modules: string[];
	/** Every Diagram SVG, `*.diagram.svg`, whether or not its source is still there. */
	svgs: string[];
}

/**
 * The files of the Atlas. In a git repo, those are the files that git tracks
 * or doesn't ignore. Outside one, discovery walks every folder except
 * `node_modules`.
 */
export async function discover(root: string): Promise<AtlasFiles> {
	const files = (inGitRepo(root) ? await gitFiles(root) : walk(root)).sort(byPath);
	return {
		modules: files.filter((file) => file.endsWith(moduleSuffix)),
		svgs: files.filter((file) => file.endsWith(svgSuffix)),
	};
}

/** Whether `folder`, or a folder above it, holds `.git`. */
function inGitRepo(folder: string): boolean {
	for (let current = folder; ; current = dirname(current)) {
		if (existsSync(join(current, ".git"))) {
			return true;
		}
		if (dirname(current) === current) {
			return false;
		}
	}
}

/**
 * The Atlas's files under `root` that git tracks or doesn't ignore, and that
 * still exist: git still lists a tracked file that was deleted.
 */
async function gitFiles(root: string): Promise<string[]> {
	const args = ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--"];
	const listing = await git(root, gitEnvironment(), [...args, `*${moduleSuffix}`, `*${svgSuffix}`]);
	return pathsIn(listing)
		.map((path) => join(root, path))
		.filter((file) => existsSync(file));
}

/**
 * The environment git runs in: the CLI's, but asking about the repo that
 * holds the Atlas, not one that the environment points at, as it does inside
 * a git hook.
 */
function gitEnvironment(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) {
		delete env[name];
	}
	return env;
}

/** Runs git in a folder, feeding it `input`, and returns what it prints. */
async function git(
	cwd: string,
	env: NodeJS.ProcessEnv,
	args: string[],
	input?: string,
): Promise<string> {
	try {
		const running = run("git", args, { cwd, env, maxBuffer: 1 << 28 });
		running.child.stdin?.end(input);
		return (await running).stdout;
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new AtlasError(`git couldn't read the repo at ${cwd}: ${reason}`);
	}
}

/** The paths git lists with `-z`, once each: during a merge, it lists a file once for each side. */
function pathsIn(listing: string): string[] {
	return [...new Set(listing.split("\0").filter((path) => path !== ""))];
}

/** What git has staged under the Atlas's root, copied out, so that lint can judge what a commit would hold. */
export interface StagedAtlas {
	/** The copy of the root. */
	root: string;
	/** The files of the Atlas in the copy, each list in path order. */
	files: AtlasFiles;
	/** Removes the copy. */
	remove(): Promise<void>;
}

/**
 * Copies every file that git has staged under the Atlas's root, as staged,
 * into a temporary folder: what a commit would hold. The copy reaches the
 * packages the repo has installed through links to its `node_modules`
 * folders, from the root up to the repo's top.
 *
 * Inside a pre-commit hook, git names the index that the commit is made from
 * in `GIT_INDEX_FILE`, which differs from the usual one for `git commit -a`
 * and for `git commit <paths>`. The copy follows it when it lies inside the
 * Atlas's repo, a relative path being relative to `cwd`.
 */
export async function stagedAtlas(root: string, cwd: string): Promise<StagedAtlas> {
	if (!inGitRepo(root)) {
		throw new AtlasError(
			"`--staged` lints what git has staged, but the Atlas isn't in a git repo.",
		);
	}
	const real = realpathSync(root);
	const env = gitEnvironment();
	const index = process.env.GIT_INDEX_FILE;
	if (index !== undefined && index !== "") {
		const gitFolder = realpathSync(
			(await git(real, env, ["rev-parse", "--absolute-git-dir"])).trim(),
		);
		const file = resolve(cwd, index);
		const inside = relative(gitFolder, existsSync(file) ? realpathSync(file) : file);
		if (inside !== "" && inside.split(sep)[0] !== ".." && !isAbsolute(inside)) {
			env.GIT_INDEX_FILE = file;
		}
	}
	const top = (await git(real, env, ["rev-parse", "--show-toplevel"])).trim();
	const prefix = (await git(real, env, ["rev-parse", "--show-prefix"])).trim();
	const paths = pathsIn(await git(real, env, ["ls-files", "-z", "--cached", "--", "."]));
	const copy = realpathSync(await mkdtemp(join(tmpdir(), "diagrams-staged-")));
	const remove = () => rm(copy, { recursive: true, force: true });
	try {
		await git(
			real,
			env,
			["checkout-index", "-z", "--stdin", `--prefix=${copy}${sep}`],
			paths.join("\0"),
		);
		for (let folder = real; ; folder = dirname(folder)) {
			const installed = join(folder, "node_modules");
			const linked = join(copy, relative(top, folder), "node_modules");
			if (existsSync(installed) && !existsSync(linked)) {
				mkdirSync(dirname(linked), { recursive: true });
				symlinkSync(installed, linked, "junction");
			}
			if (folder === top || dirname(folder) === folder) {
				break;
			}
		}
	} catch (error) {
		await remove();
		throw error;
	}
	const stagedRoot = join(copy, prefix);
	const files = paths.map((path) => join(stagedRoot, path)).sort(byPath);
	return {
		root: stagedRoot,
		files: {
			modules: files.filter((file) => file.endsWith(moduleSuffix)),
			svgs: files.filter((file) => file.endsWith(svgSuffix)),
		},
		remove,
	};
}

/** The Atlas's files under `root`, in every folder except `.git` and `node_modules`. */
function walk(root: string): string[] {
	const files: string[] = [];
	const visit = (folder: string) => {
		for (const entry of readdirSync(folder, { withFileTypes: true })) {
			const path = join(folder, entry.name);
			if (entry.isDirectory()) {
				if (entry.name !== ".git" && entry.name !== "node_modules") {
					visit(path);
				}
			} else if (
				entry.isFile() &&
				(entry.name.endsWith(moduleSuffix) || entry.name.endsWith(svgSuffix))
			) {
				files.push(path);
			}
		}
	};
	visit(root);
	return files;
}

/** Folder by folder, so that `a/b.diagram.ts` comes before `a-b.diagram.ts`. */
export function byPath(a: string, b: string): number {
	const left = a.split(sep);
	const right = b.split(sep);
	for (let index = 0; index < Math.min(left.length, right.length); index++) {
		const one = left[index] ?? "";
		const other = right[index] ?? "";
		if (one !== other) {
			return one < other ? -1 : 1;
		}
	}
	return left.length - right.length;
}
