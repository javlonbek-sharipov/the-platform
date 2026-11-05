/**
 * The Atlas, on the Node side: it loads the config and the Diagrams that
 * discovery finds, renders each Diagram, and runs every check, from the
 * model's own rules to those that span Diagrams and the SVGs on disk.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import type { Declarations } from "../authoring/declarations.ts";
import type { AnyDiagram } from "../authoring/model.ts";
import { recordUnknownOptions } from "../authoring/options.ts";
import { compareText } from "../core/bundles.ts";
import { render } from "../core/render.ts";
import { bundledFontData } from "../fonts/bundled.ts";
import { checkIds, checkLinks, checkNamespaceHomes } from "./checks.ts";
import {
	type AtlasFiles,
	byPath,
	configFile,
	discover,
	moduleSuffix,
	stagedAtlas,
	svgSuffix,
} from "./discover.ts";
import { type Loaded, load } from "./load.ts";
import { type AtlasMessage, type FilePlace, located, placeText } from "./messages.ts";

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
	model?: AnyDiagram;
	declarations: Declarations;
	messages: AtlasMessage[];
}

/** A Diagram's id: its module's path from the repo root, minus `.diagram.ts`. */
function diagramIdOf(root: string, module: string): string {
	return repoPath(root, module).slice(0, -moduleSuffix.length);
}

/** `x.diagram.ts` is drawn in `x.diagram.svg`, beside it. */
export function svgFileOf(module: string): string {
	if (!module.endsWith(moduleSuffix)) {
		throw new Error(`${module} isn't a diagram module, so it has no SVG`);
	}
	return `${module.slice(0, -moduleSuffix.length)}${svgSuffix}`;
}

/** One opening of the Atlas, shared by render, lint, export and the index. */
export interface OpenAtlas {
	root: string;
	files: AtlasFiles;
	diagrams: RenderedDiagram[];
	/** Config errors apply to every command, including one that selects a single Diagram. */
	messages: AtlasMessage[];
	/** Even an invalid Diagram may draw an id, so Links don't duplicate its own errors. */
	drawn: ReadonlySet<string>;
}

/** Loads the config and every module together, in a fresh module context. */
export async function openAtlas(root: string, files?: AtlasFiles): Promise<OpenAtlas> {
	files ??= await discover(root);
	const [config, ...modules] = await load([join(root, configFile), ...files.modules]);
	return {
		root,
		files,
		diagrams: modules.map((loaded) => renderLoaded(root, loaded)),
		messages: config === undefined ? [] : checkConfig(root, config),
		drawn: new Set(modules.flatMap(idsDrawnBy)),
	};
}

/** What lint found: how many Diagrams it checked, and its messages, file by file. */
export interface Linted {
	diagrams: number;
	messages: AtlasMessage[];
}

/**
 * Lints the whole Atlas. It loads the config and every Diagram, renders each
 * Diagram, and runs every check: each model's own rules, the checks that span
 * Diagrams, and each SVG on disk against its fresh render. The messages come
 * file by file.
 *
 * `files` are the Atlas's files, which discovery finds unless given, and
 * `svgWords` how the messages about SVGs read.
 */
export async function lintAtlas(
	root: string,
	files?: AtlasFiles,
	svgWords: SvgWords = workingTree,
): Promise<Linted> {
	const atlas = await openAtlas(root, files);
	const { diagrams: rendered } = atlas;
	const valid = rendered.flatMap(({ module, model, declarations }) =>
		model === undefined ? [] : [{ module, id: diagramIdOf(root, module), model, declarations }],
	);
	const messages = [
		...atlas.messages,
		...rendered.flatMap((diagram) => {
			const stale =
				diagram.svg === undefined ? undefined : checkSvg(diagram.svgFile, diagram.svg, svgWords);
			return stale === undefined ? diagram.messages : [...diagram.messages, stale];
		}),
		...checkOrphans(atlas.files, svgWords),
		...checkIds(valid),
		...checkNamespaceHomes(valid),
		...checkLinks(root, valid, atlas.drawn),
	];
	return { diagrams: rendered.length, messages: messages.sort(byPlace) };
}

/**
 * Lints what git has staged under the Atlas's root, which is what a commit
 * would hold, rather than the working tree: a copy of the staged files, which
 * the messages name by their own paths. So an SVG rendered but left unstaged
 * beside its staged source fails, as do a source or an import staged without
 * its new SVG.
 */
export async function lintStaged(root: string, cwd: string): Promise<Linted> {
	const staged = await stagedAtlas(root, cwd);
	try {
		const { diagrams, messages } = await lintAtlas(staged.root, staged.files, stagedFiles);
		const own = (text: string) => text.replaceAll(staged.root, root);
		return {
			diagrams,
			messages: messages.map((message) => ({
				...message,
				file: own(message.file),
				message: own(message.message),
			})),
		};
	} finally {
		await staged.remove();
	}
}

/** How the messages about SVGs read: about the working tree, or about what's staged. */
interface SvgWords {
	missing: string;
	outOfDate: string;
	orphaned: (source: string) => string;
}

const workingTree: SvgWords = {
	missing: "The SVG is missing. Run `diagrams render`, and commit the SVG with its source.",
	outOfDate: "The SVG no longer matches its source. Run `diagrams render`.",
	orphaned: (source) =>
		`The SVG's source, \`${source}\`, isn't in the Atlas. Delete the SVG, or restore its source.`,
};

const stagedFiles: SvgWords = {
	missing: "The SVG isn't staged. Run `diagrams render`, and stage the SVG with its source.",
	outOfDate:
		"The staged SVG doesn't match its staged source. Run `diagrams render`, and stage the SVG with its source.",
	orphaned: (source) =>
		`The staged SVG's source, \`${source}\`, isn't staged. Stage its source, or delete the SVG and stage that.`,
};

/**
 * The Atlas index (spec: The Atlas index): every Diagram, and every id with
 * its Kind, its title, and the Diagrams that draw it as a Node or as a Group,
 * each in path order. Paths and Diagram ids are repo paths.
 */
export interface AtlasIndex {
	diagrams: { id: string; title: string; notation: string; svg: string }[];
	/** By id, in code unit order. */
	ids: Record<string, { kind: string; title: string; asNode: string[]; asGroup: string[] }>;
	/** Every glossary term, with its context, its definition and the words it avoids: none until slice 2 brings glossaries. */
	terms: never[];
}

/**
 * Builds the Atlas index from every Diagram. The index lists only what holds
 * across the Atlas, so a Diagram with errors, or an id that two Diagrams give
 * different Kinds or titles, leaves no index: their errors come instead.
 */
export async function indexAtlas(
	root: string,
): Promise<{ index?: AtlasIndex; errors: AtlasMessage[] }> {
	const atlas = await openAtlas(root);
	const { diagrams: rendered } = atlas;
	const valid = rendered.flatMap(({ module, model, declarations }) =>
		model === undefined ? [] : [{ module, id: diagramIdOf(root, module), model, declarations }],
	);
	const errors = [
		...atlas.messages,
		...rendered.flatMap(({ messages }) => messages),
		...checkIds(valid),
	]
		.filter((message) => message.severity === "error")
		.sort(byPlace);
	if (errors.length > 0) {
		return { errors };
	}
	const ids = new Map<string, AtlasIndex["ids"][string]>();
	const entryOf = ({ id, kind, title }: { id: string; kind: string; title: string }) => {
		const entry = ids.get(id) ?? { kind, title, asNode: [], asGroup: [] };
		ids.set(id, entry);
		return entry;
	};
	for (const { id, model } of valid) {
		for (const node of model.nodes) {
			entryOf(node).asNode.push(id);
		}
		for (const group of model.groups) {
			entryOf(group).asGroup.push(id);
		}
	}
	const index: AtlasIndex = {
		diagrams: valid.map(({ module, id, model }) => ({
			id,
			title: model.title,
			notation: model.notation,
			svg: repoPath(root, svgFileOf(module)),
		})),
		ids: Object.fromEntries([...ids].sort(([a], [b]) => compareText(a, b))),
		terms: [],
	};
	return { index, errors };
}

/** The ids of the Nodes and Groups that a module's Diagram draws, as far as its model can be read. */
function idsDrawnBy(loaded: Loaded): string[] {
	const model = "exported" in loaded ? (loaded.exported as Record<string, unknown> | null) : null;
	return [model?.nodes, model?.groups].flatMap((things) =>
		Array.isArray(things)
			? things.flatMap((thing) => {
					const id = (thing as { id?: unknown } | null)?.id;
					return typeof id === "string" ? [id] : [];
				})
			: [],
	);
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
	const { exported, declarations, unknownOptions } = loaded;
	if (exported === undefined) {
		return {
			module,
			svgFile,
			declarations,
			messages: [moduleLoad({ file: module }, "The module doesn't default-export a Diagram.")],
		};
	}
	if (typeof exported === "object" && exported !== null && !Array.isArray(exported)) {
		// A Diagram's id is its module's path, which only the Atlas knows. The
		// errors about options the builder didn't know cross from the module's
		// loader beside the model, as they left the builder.
		Object.assign(exported, { id: diagramIdOf(root, module) });
		recordUnknownOptions(exported, unknownOptions);
	}
	const { diagnostics, svg } = render(exported, { fontData: bundledFontData });
	const messages = diagnostics.map((diagnostic) => located(module, declarations, diagnostic));
	return svg === undefined
		? { module, svgFile, declarations, messages }
		: { module, svgFile, svg, model: exported as AnyDiagram, declarations, messages };
}

/** The config must load, and default-export what `atlas()` returns, with no option it doesn't know. */
function checkConfig(root: string, config: Loaded): AtlasMessage[] {
	if ("failed" in config) {
		return [loadFailure(root, config)];
	}
	const { exported, declarations, unknownOptions } = config;
	if (typeof exported !== "object" || exported === null || Array.isArray(exported)) {
		return [
			moduleLoad(
				{ file: config.module },
				"The config doesn't default-export an Atlas config. Write `export default atlas({});`.",
			),
		];
	}
	return unknownOptions.map((diagnostic) => located(config.module, declarations, diagnostic));
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

function moduleLoad(place: FilePlace, message: string): AtlasMessage {
	return { ...place, severity: "error", rule: "module-load", message };
}

/** A path as the Atlas names it: from the repo root, with `/`. */
function repoPath(root: string, file: string): string {
	return relative(root, file).split(sep).join("/");
}

/** Every SVG needs its source beside it. */
function checkOrphans({ modules, svgs }: AtlasFiles, words: SvgWords): AtlasMessage[] {
	const drawn = new Set(modules.map(svgFileOf));
	return svgs
		.filter((svg) => !drawn.has(svg))
		.map((svg) => ({
			file: svg,
			severity: "error",
			rule: "svg-orphaned",
			message: words.orphaned(`${basename(svg).slice(0, -svgSuffix.length)}${moduleSuffix}`),
		}));
}

/** How the SVG on disk compares with a fresh render, byte for byte. */
export function svgOnDisk(svgFile: string, svg: string): "missing" | "out-of-date" | "current" {
	if (!existsSync(svgFile)) {
		return "missing";
	}
	return readFileSync(svgFile).equals(Buffer.from(svg, "utf8")) ? "current" : "out-of-date";
}

function checkSvg(svgFile: string, svg: string, words: SvgWords): AtlasMessage | undefined {
	const state = svgOnDisk(svgFile, svg);
	return state === "current"
		? undefined
		: {
				file: svgFile,
				severity: "error",
				rule: `svg-${state}`,
				message: state === "missing" ? words.missing : words.outOfDate,
			};
}
