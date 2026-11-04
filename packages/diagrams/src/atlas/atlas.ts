/**
 * The Atlas, on the Node side: it finds the diagram modules in the repo,
 * loads and renders them, and compares the SVGs on disk with fresh renders.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Diagnostic } from "../core/diagnostics.ts";
import { render } from "../core/render.ts";
import { load } from "./load.ts";

/** The engine's cache folder, at the repo root. Git ignores it. */
export const cacheFolder = ".diagrams-cache";

const moduleSuffix = ".diagram.ts";

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

/**
 * The repo root: the nearest folder at or above `cwd` that holds `.git`.
 * Outside a git repo, it's `cwd` itself.
 */
export function findRoot(cwd: string): string {
	const start = resolve(cwd);
	for (let folder = start; ; folder = dirname(folder)) {
		if (existsSync(join(folder, ".git"))) {
			return folder;
		}
		if (dirname(folder) === folder) {
			return start;
		}
	}
}

/**
 * Every diagram module in `folder`, in path order. It skips `.git` and
 * `node_modules` everywhere, and the reference clones in the root's `repos`.
 * Ticket 05 replaces this walk with git's view of the repo.
 */
export function discover(root: string, folder = root): string[] {
	const modules: string[] = [];
	const walk = (current: string) => {
		const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) =>
			a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
		);
		for (const entry of entries) {
			const path = join(current, entry.name);
			if (entry.isDirectory()) {
				const skipped =
					entry.name === ".git" ||
					entry.name === "node_modules" ||
					(entry.name === "repos" && current === root);
				if (!skipped) {
					walk(path);
				}
			} else if (entry.isFile() && entry.name.endsWith(moduleSuffix)) {
				modules.push(path);
			}
		}
	};
	walk(resolve(folder));
	return modules;
}

/** `x.diagram.ts` is drawn in `x.diagram.svg`, beside it. */
export function svgFileOf(module: string): string {
	return `${module.slice(0, -".ts".length)}.svg`;
}

/** Loads each module, and renders its Diagram. */
export async function renderDiagrams(modules: string[]): Promise<RenderedDiagram[]> {
	return (await load(modules)).map((loaded) => {
		const svgFile = svgFileOf(loaded.module);
		if ("error" in loaded) {
			return {
				module: loaded.module,
				svgFile,
				messages: [
					{ file: loaded.module, severity: "error", rule: "module-load", message: loaded.error },
				],
			};
		}
		const { diagnostics, svg } = render(loaded.diagram);
		const messages = diagnostics.map((diagnostic) => ({ file: loaded.module, ...diagnostic }));
		return svg === undefined
			? { module: loaded.module, svgFile, messages }
			: { module: loaded.module, svgFile, svg, messages };
	});
}

/** Renders every Diagram in the Atlas, and checks each SVG on disk against it. */
export async function lintAtlas(
	root: string,
): Promise<{ diagrams: number; messages: AtlasMessage[] }> {
	const rendered = await renderDiagrams(discover(root));
	const messages = rendered.flatMap((diagram) => {
		const stale = diagram.svg === undefined ? undefined : checkSvg(diagram.svgFile, diagram.svg);
		return stale === undefined ? diagram.messages : [...diagram.messages, stale];
	});
	return { diagrams: rendered.length, messages };
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
