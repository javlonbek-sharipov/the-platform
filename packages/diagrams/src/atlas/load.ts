import { Worker } from "node:worker_threads";

/** What the worker posts for one module: its default export as JSON, or why it failed to load. */
export type LoadResult =
	| { module: string; json: string | undefined }
	| { module: string; error: string };

/** What loading one module gave: its default export, or why it failed to load. */
export type Loaded = { module: string; exported: unknown } | { module: string; error: string };

/**
 * Loads modules in a fresh worker thread, so that edits to them and to the
 * modules they import are always picked up.
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
				"error" in result
					? result
					: {
							module: result.module,
							exported: result.json === undefined ? undefined : JSON.parse(result.json),
						},
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
