/**
 * Where the Atlas is, and which files it has: the config marks the repo root,
 * and git's view of the repo, or a walk of its folders, finds the Diagrams.
 */

import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
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
	// Ask about the repo that holds `root`, not one that the environment
	// points at, as it does inside a git hook.
	const env = { ...process.env };
	for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) {
		delete env[name];
	}
	let listing: string;
	try {
		const args = ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--"];
		const patterns = [`*${moduleSuffix}`, `*${svgSuffix}`];
		listing = (await run("git", [...args, ...patterns], { cwd: root, env })).stdout;
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new AtlasError(`git couldn't list the files of the repo at ${root}: ${reason}`);
	}
	// During a merge, git lists a file once for each side of a conflict.
	const paths = new Set(listing.split("\0").filter((path) => path !== ""));
	return [...paths].map((path) => join(root, path)).filter((file) => existsSync(file));
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
