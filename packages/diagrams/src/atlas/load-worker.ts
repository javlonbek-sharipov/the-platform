/**
 * Runs in a worker thread, so that each load starts from a fresh module
 * graph and picks up every edit. Imports each module through Node's type
 * stripping, and posts back its default export as JSON.
 */

import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parentPort, workerData } from "node:worker_threads";
import { type Declarations, declarationsKey, framePosition } from "../authoring/declarations.ts";
import { unknownOptionsOf } from "../authoring/options.ts";
import { isExcluded } from "./excluded.ts";
import type { LoadInput, LoadMessage, LoadResult, Place } from "./load.ts";

const { modules, excluded } = workerData as LoadInput;

function permitted(url: string): void {
	if (url.startsWith("file:") && isExcluded(fileURLToPath(url), excluded)) {
		throw new Error(`${fileURLToPath(url)} is excluded by this Atlas host.`);
	}
}

const imports = new Map<string, Set<string>>();
const reported = new Set<string>();
function dependency(parent: string | undefined, url: string): void {
	if (!url.startsWith("file:")) return;
	if (parent !== undefined) {
		const children = imports.get(parent) ?? new Set<string>();
		children.add(url);
		imports.set(parent, children);
	}
	const file = fileURLToPath(url);
	if (!reported.has(file)) {
		reported.add(file);
		post({ type: "dependency", file });
	}
}

const hooks = registerHooks({
	resolve(specifier, context, nextResolve) {
		try {
			if (/^(file:|\.{1,2}\/|\/)/.test(specifier))
				permitted(new URL(specifier, context.parentURL).href);
			const result = nextResolve(specifier, context);
			permitted(result.url);
			dependency(context.parentURL, result.url);
			return result;
		} catch (error) {
			const url = (error as { url?: string }).url;
			if (url !== undefined) dependency(context.parentURL, url);
			throw error;
		}
	},
	load(url, context, nextLoad) {
		permitted(url);
		return nextLoad(url, context);
	},
});

function dependenciesOf(module: string): string[] {
	const urls = new Set([pathToFileURL(module).href]);
	for (const url of urls) for (const child of imports.get(url) ?? []) urls.add(child);
	return [...urls].map((url) => fileURLToPath(url)).sort();
}

function post(message: LoadMessage): void {
	parentPort?.postMessage(message);
}

for (const module of modules) {
	const result = await loadModule(module);
	post({ type: "result", result: { ...result, dependencies: dependenciesOf(module) } });
}
hooks.deregister();

async function loadModule(module: string): Promise<LoadResult> {
	let exports: { default?: unknown };
	try {
		exports = await import(pathToFileURL(module).href);
	} catch (error) {
		const at = thrownAt(error, module);
		return {
			module,
			dependencies: [],
			failed: "import",
			reason: messageOf(error),
			...(at && { at }),
		};
	}
	try {
		const json = JSON.stringify(exports.default);
		return {
			module,
			dependencies: [],
			json,
			declarations: declarationsOf(exports.default),
			unknownOptions: unknownOptionsOf(exports.default),
		};
	} catch (error) {
		return { module, dependencies: [], failed: "json", reason: messageOf(error) };
	}
}

/** Where the builder recorded each declaration, with paths in place of file URLs. */
function declarationsOf(exported: unknown): Declarations {
	const recorded =
		typeof exported === "object" && exported !== null
			? (exported as { [declarationsKey]?: Declarations })[declarationsKey]
			: undefined;
	return Object.fromEntries(
		Object.entries(recorded ?? {}).map(([pointer, position]) => [
			pointer,
			{
				...position,
				file: position.file.startsWith("file:") ? fileURLToPath(position.file) : position.file,
			},
		]),
	);
}

/**
 * Where an error from importing `module` came from: the first place in
 * `module` that its stack names, or else the first place in any file.
 */
function thrownAt(error: unknown, module: string): Place | undefined {
	const stack = error instanceof Error && typeof error.stack === "string" ? error.stack : "";
	const places: Place[] = [];
	const lines = stack.split("\n");
	// A syntax error's stack starts with `url:line`, then the source and a caret.
	const syntax = /^(file:\S+):(\d+)$/.exec(lines[0] ?? "");
	if (syntax !== null) {
		places.push({ file: fileURLToPath(syntax[1] ?? ""), line: Number(syntax[2]) });
	}
	for (const line of lines) {
		const position = framePosition(line);
		if (position?.file.startsWith("file:")) {
			places.push({ ...position, file: fileURLToPath(position.file) });
		}
	}
	return places.find((place) => place.file === module) ?? places[0];
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
