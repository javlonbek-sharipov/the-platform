import { Worker } from "node:worker_threads";

/** What loading one diagram module gave: its default export as JSON, or why there's none. */
export type LoadResult = { module: string; json: string } | { module: string; error: string };

export type Loaded = { module: string; diagram: unknown } | { module: string; error: string };

/**
 * Loads diagram modules in a fresh worker thread, so that edits to them and
 * to the modules they import are always picked up.
 */
export function load(modules: string[]): Promise<Loaded[]> {
	if (modules.length === 0) {
		return Promise.resolve([]);
	}
	return new Promise((resolve) => {
		const results = new Map<string, Loaded>();
		let failure = "The module loader stopped before it reached this module.";
		const finish = () => {
			resolve(modules.map((module) => results.get(module) ?? { module, error: failure }));
		};
		const worker = new Worker(new URL("./load-worker.ts", import.meta.url), {
			workerData: modules,
		});
		worker.on("message", (result: LoadResult) => {
			results.set(
				result.module,
				"json" in result ? { module: result.module, diagram: JSON.parse(result.json) } : result,
			);
			if (results.size === modules.length) {
				// A module may have left timers running; its results are all in.
				void worker.terminate();
			}
		});
		worker.on("error", (error) => {
			failure = `The module loader stopped: ${error.message}`;
		});
		worker.on("exit", finish);
	});
}
