/**
 * The Atlas, on the Node side: it finds the diagram modules in the repo,
 * loads and renders them, and compares the SVGs on disk with fresh renders.
 */

import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { Diagnostic } from "../core/diagnostics.ts";
import { render } from "../core/render.ts";
import { type Loaded, load } from "./load.ts";

/** The engine's cache folder, at the repo root. Git ignores it. */
export const cacheFolder = ".diagrams-cache";

const moduleSuffix = ".diagram.ts";

const run = promisify(execFile);

/** A diagnostic, with the file it's about. */
export interface AtlasMessage extends Diagnostic {
	file: string;
}

export interface RenderedDiagram {
	module: string;
	svgFile: string;
	/** The fresh render, when the Diagram has no errors. */
	svg?: string;
	messages: AtlasMessage[];
}

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

/**
 * Every diagram module in the Atlas, in path order. In a git repo, those are
 * the modules that git tracks or doesn't ignore. Outside one, discovery walks
 * every folder except `node_modules`.
 */
export async function discover(root: string): Promise<string[]> {
	const files = inGitRepo(root) ? await gitFiles(root) : walk(root);
	return files.sort(byPath);
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
 * The diagram modules under `root` that git tracks or doesn't ignore, and
 * that still exist: git still lists a tracked file that was deleted.
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
		const args = ["ls-files", "-z", "--cached", "--others", "--exclude-standard"];
		listing = (await run("git", [...args, "--", `*${moduleSuffix}`], { cwd: root, env })).stdout;
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new AtlasError(`git couldn't list the files of the repo at ${root}: ${reason}`);
	}
	// During a merge, git lists a file once for each side of a conflict.
	const paths = new Set(listing.split("\0").filter((path) => path !== ""));
	return [...paths].map((path) => join(root, path)).filter((file) => existsSync(file));
}

/** The diagram modules under `root`, in every folder except `.git` and `node_modules`. */
function walk(root: string): string[] {
	const modules: string[] = [];
	const visit = (folder: string) => {
		for (const entry of readdirSync(folder, { withFileTypes: true })) {
			const path = join(folder, entry.name);
			if (entry.isDirectory()) {
				if (entry.name !== ".git" && entry.name !== "node_modules") {
					visit(path);
				}
			} else if (entry.isFile() && entry.name.endsWith(moduleSuffix)) {
				modules.push(path);
			}
		}
	};
	visit(root);
	return modules;
}

/** Folder by folder, so that `a/b.diagram.ts` comes before `a-b.diagram.ts`. */
function byPath(a: string, b: string): number {
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

/** `x.diagram.ts` is drawn in `x.diagram.svg`, beside it. */
export function svgFileOf(module: string): string {
	return `${module.slice(0, -".ts".length)}.svg`;
}

/** Loads each module, and renders its Diagram. */
export async function renderDiagrams(modules: string[]): Promise<RenderedDiagram[]> {
	return (await load(modules)).map(renderLoaded);
}

/**
 * Loads the config and every Diagram in the Atlas, renders each Diagram, and
 * checks each SVG on disk against its fresh render.
 */
export async function lintAtlas(
	root: string,
): Promise<{ diagrams: number; messages: AtlasMessage[] }> {
	const [config, ...modules] = await load([join(root, configFile), ...(await discover(root))]);
	const rendered = modules.map(renderLoaded);
	const messages = [
		...(config === undefined ? [] : checkConfig(config)),
		...rendered.flatMap((diagram) => {
			const stale = diagram.svg === undefined ? undefined : checkSvg(diagram.svgFile, diagram.svg);
			return stale === undefined ? diagram.messages : [...diagram.messages, stale];
		}),
	];
	return { diagrams: rendered.length, messages };
}

function renderLoaded(loaded: Loaded): RenderedDiagram {
	const { module } = loaded;
	const svgFile = svgFileOf(module);
	if ("error" in loaded) {
		return { module, svgFile, messages: [loadError(module, loaded.error)] };
	}
	if (loaded.exported === undefined) {
		return {
			module,
			svgFile,
			messages: [loadError(module, "The module doesn't default-export a Diagram.")],
		};
	}
	const { diagnostics, svg } = render(loaded.exported);
	const messages = diagnostics.map((diagnostic) => ({ file: module, ...diagnostic }));
	return svg === undefined ? { module, svgFile, messages } : { module, svgFile, svg, messages };
}

/** The config must load, and default-export what `atlas()` returns. */
function checkConfig(config: Loaded): AtlasMessage[] {
	if ("error" in config) {
		return [loadError(config.module, config.error)];
	}
	const { exported } = config;
	if (typeof exported !== "object" || exported === null || Array.isArray(exported)) {
		return [
			loadError(
				config.module,
				"The config doesn't default-export an Atlas config. Write `export default atlas({});`.",
			),
		];
	}
	return [];
}

function loadError(file: string, message: string): AtlasMessage {
	return { file, severity: "error", rule: "module-load", message };
}

function checkSvg(svgFile: string, svg: string): AtlasMessage | undefined {
	if (!existsSync(svgFile)) {
		return {
			file: svgFile,
			severity: "error",
			rule: "svg-missing",
			message: "The SVG is missing. Run `diagrams render`, and commit the SVG with its source.",
		};
	}
	if (!readFileSync(svgFile).equals(Buffer.from(svg, "utf8"))) {
		return {
			file: svgFile,
			severity: "error",
			rule: "svg-out-of-date",
			message: "The SVG no longer matches its source. Run `diagrams render`.",
		};
	}
	return undefined;
}
