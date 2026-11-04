/**
 * Runs in a worker thread, so that each load starts from a fresh module
 * graph and picks up every edit. Imports each module through Node's type
 * stripping, and posts back its default export as JSON.
 */

import { pathToFileURL } from "node:url";
import { parentPort, workerData } from "node:worker_threads";
import type { LoadResult } from "./load.ts";

for (const module of workerData as string[]) {
	parentPort?.postMessage(await loadModule(module));
}

async function loadModule(module: string): Promise<LoadResult> {
	let exports: { default?: unknown };
	try {
		exports = await import(pathToFileURL(module).href);
	} catch (error) {
		return { module, error: `The module failed to load: ${messageOf(error)}` };
	}
	try {
		return { module, json: JSON.stringify(exports.default) };
	} catch (error) {
		return { module, error: `The module's default export isn't JSON: ${messageOf(error)}` };
	}
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
