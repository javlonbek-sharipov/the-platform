/**
 * The Atlas, on the Node side: it finds the diagram modules in the repo,
 * loads and renders them, and compares the SVGs on disk with fresh renders.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Diagnostic } from "../core/diagnostics.ts";
import { render } from "../core/render.ts";
import { type Loaded, load } from "./load.ts";

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
 * Every diagram module in `folder`, in path order. It skips `.git` and
 * `node_modules` everywhere, and the reference clones in the root's `repos`.
 * Ticket 05 replaces this walk with git's view of the repo.
 */
export function discover(root: string, folder = root): string[] {
	const top = resolve(root);
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
					(entry.name === "repos" && current === top);
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
	return (await load(modules)).map(renderLoaded);
}

/**
 * Loads the config and every Diagram in the Atlas, renders each Diagram, and
 * checks each SVG on disk against its fresh render.
 */
export async function lintAtlas(
	root: string,
): Promise<{ diagrams: number; messages: AtlasMessage[] }> {
	const [config, ...modules] = await load([join(root, configFile), ...discover(root)]);
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
