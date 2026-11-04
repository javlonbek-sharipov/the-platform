/**
 * The Atlas, on the Node side: it loads the config and the Diagrams that
 * discovery finds, renders each Diagram, and runs every check, from the
 * model's own rules to those that span Diagrams and the SVGs on disk.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import type { Declarations } from "../authoring/declarations.ts";
import type { Diagram } from "../authoring/model.ts";
import { render } from "../core/render.ts";
import { bundledFontData } from "../fonts/bundled.ts";
import { checkIds, checkLinks } from "./checks.ts";
import {
	type AtlasFiles,
	byPath,
	configFile,
	discover,
	moduleSuffix,
	svgSuffix,
} from "./discover.ts";
import { type Loaded, load, type Place } from "./load.ts";
import { type AtlasMessage, located, placeText } from "./messages.ts";

/** The engine's cache folder, at the repo root. Git ignores it. */
export const cacheFolder = ".diagrams-cache";

/**
 * The cache folder of the Atlas at `root`, made if it's missing. It holds a
 * `.gitignore` that ignores everything in it, itself included, so that git
 * ignores the folder in any repo, whatever the repo's own `.gitignore` says.
 */
export function cacheFolderOf(root: string): string {
	const folder = join(root, cacheFolder);
	const ignore = join(folder, ".gitignore");
	if (!existsSync(ignore)) {
		mkdirSync(folder, { recursive: true });
		writeFileSync(ignore, "# The diagrams engine's cache. Git ignores everything in it.\n*\n");
	}
	return folder;
}

export interface RenderedDiagram {
	module: string;
	svgFile: string;
	/** The fresh render, and the valid model, when the Diagram has no errors. */
	svg?: string;
	model?: Diagram;
	declarations: Declarations;
	messages: AtlasMessage[];
}

/** A Diagram's id: its module's path from the repo root, minus `.diagram.ts`. */
function diagramIdOf(root: string, module: string): string {
	return repoPath(root, module).slice(0, -moduleSuffix.length);
}

/** `x.diagram.ts` is drawn in `x.diagram.svg`, beside it. */
export function svgFileOf(module: string): string {
	return `${module.slice(0, -moduleSuffix.length)}${svgSuffix}`;
}

/** Loads each module, and renders its Diagram, embedding a subset of the bundled font. */
export async function renderDiagrams(root: string, modules: string[]): Promise<RenderedDiagram[]> {
	return (await load(modules)).map((loaded) => renderLoaded(root, loaded));
}

/**
 * Lints the whole Atlas. It loads the config and every Diagram, renders each
 * Diagram, and runs every check: each model's own rules, the checks that span
 * Diagrams, and each SVG on disk against its fresh render. The messages come
 * file by file.
 */
export async function lintAtlas(
	root: string,
): Promise<{ diagrams: number; messages: AtlasMessage[] }> {
	const files = await discover(root);
	const [config, ...modules] = await load([join(root, configFile), ...files.modules]);
	const rendered = modules.map((loaded) => renderLoaded(root, loaded));
	const valid = rendered.flatMap(({ module, model, declarations }) =>
		model === undefined ? [] : [{ module, id: diagramIdOf(root, module), model, declarations }],
	);
	const messages = [
		...(config === undefined ? [] : checkConfig(root, config)),
		...rendered.flatMap((diagram) => {
			const stale = diagram.svg === undefined ? undefined : checkSvg(diagram.svgFile, diagram.svg);
			return stale === undefined ? diagram.messages : [...diagram.messages, stale];
		}),
		...checkOrphans(files),
		...checkIds(valid),
		...checkLinks(root, valid, new Set(modules.flatMap(idsDrawnBy))),
	];
	return { diagrams: rendered.length, messages: messages.sort(byPlace) };
}

/** The ids of the Nodes that a module's Diagram draws, as far as its model can be read. */
function idsDrawnBy(loaded: Loaded): string[] {
	const nodes = "exported" in loaded ? (loaded.exported as { nodes?: unknown })?.nodes : undefined;
	return Array.isArray(nodes)
		? nodes.flatMap((node) => {
				const id = (node as { id?: unknown } | null)?.id;
				return typeof id === "string" ? [id] : [];
			})
		: [];
}

/** File by file, and top to bottom in each file. A message about a whole file comes first. */
function byPlace(a: AtlasMessage, b: AtlasMessage): number {
	return (
		byPath(a.file, b.file) || (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0)
	);
}

function renderLoaded(root: string, loaded: Loaded): RenderedDiagram {
	const { module } = loaded;
	const svgFile = svgFileOf(module);
	if ("failed" in loaded) {
		return { module, svgFile, declarations: {}, messages: [loadFailure(root, loaded)] };
	}
	const { exported, declarations } = loaded;
	if (exported === undefined) {
		return {
			module,
			svgFile,
			declarations,
			messages: [moduleLoad({ file: module }, "The module doesn't default-export a Diagram.")],
		};
	}
	if (typeof exported === "object" && exported !== null && !Array.isArray(exported)) {
		// A Diagram's id is its module's path, which only the Atlas knows.
		Object.assign(exported, { id: diagramIdOf(root, module) });
	}
	const { diagnostics, svg } = render(exported, { fontData: bundledFontData });
	const messages = diagnostics.map((diagnostic) => located(module, declarations, diagnostic));
	return svg === undefined
		? { module, svgFile, declarations, messages }
		: { module, svgFile, svg, model: exported as Diagram, declarations, messages };
}

/** The config must load, and default-export what `atlas()` returns. */
function checkConfig(root: string, config: Loaded): AtlasMessage[] {
	if ("failed" in config) {
		return [loadFailure(root, config)];
	}
	const { exported } = config;
	if (typeof exported !== "object" || exported === null || Array.isArray(exported)) {
		return [
			moduleLoad(
				{ file: config.module },
				"The config doesn't default-export an Atlas config. Write `export default atlas({});`.",
			),
		];
	}
	return [];
}

/**
 * Why a module failed to load. When the error came from the module itself,
 * the message points at its line; when it came from a module it imports, the
 * message names that place.
 */
function loadFailure(root: string, failure: Extract<Loaded, { failed: unknown }>): AtlasMessage {
	const { module, reason, at } = failure;
	if (failure.failed === "json") {
		return moduleLoad({ file: module }, `The module's default export isn't JSON: ${reason}`);
	}
	if (at?.file === module) {
		return moduleLoad(at, `The module failed to load: ${reason}`);
	}
	const where = at === undefined ? "" : `${placeText({ ...at, file: repoPath(root, at.file) })}: `;
	return moduleLoad({ file: module }, `The module failed to load: ${where}${reason}`);
}

function moduleLoad(place: Place | { file: string }, message: string): AtlasMessage {
	return { ...place, severity: "error", rule: "module-load", message };
}

/** A path as the Atlas names it: from the repo root, with `/`. */
function repoPath(root: string, file: string): string {
	return relative(root, file).split(sep).join("/");
}

/** Every SVG needs its source beside it. */
function checkOrphans({ modules, svgs }: AtlasFiles): AtlasMessage[] {
	const drawn = new Set(modules.map(svgFileOf));
	return svgs
		.filter((svg) => !drawn.has(svg))
		.map((svg) => ({
			file: svg,
			severity: "error",
			rule: "svg-orphaned",
			message: `The SVG's source, \`${basename(svg).slice(0, -svgSuffix.length)}${moduleSuffix}\`, isn't in the Atlas. Delete the SVG, or restore its source.`,
		}));
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
