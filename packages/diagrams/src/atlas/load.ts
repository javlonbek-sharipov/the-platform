import { Worker } from "node:worker_threads";
import type { Declarations } from "../authoring/declarations.ts";

/** A place in a file: where an error was thrown, or where a syntax error is. */
export interface Place {
	/** A path. */
	file: string;
	line: number;
	/** Node gives no column for a syntax error. */
	column?: number;
}

/**
 * What loading one module gave: its default export, with the positions of
 * the declarations that built it, or why it failed.
 *
 * - `import`: importing the module, or a module it imports, threw.
 * - `json`: its default export can't be written as JSON.
 */
export type Loaded =
	| { module: string; exported: unknown; declarations: Declarations }
	| { module: string; failed: "import" | "json"; reason: string; at?: Place };

/** What the worker posts for one module: its default export as JSON, or why it failed. */
export type LoadResult =
	| { module: string; json: string | undefined; declarations: Declarations }
	| Extract<Loaded, { failed: unknown }>;

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
		let failure = "the module loader stopped before it reached this module.";
		const finish = () => {
			resolve(
				modules.map(
					(module) => results.get(module) ?? { module, failed: "import", reason: failure },
				),
			);
		};
		const worker = new Worker(new URL("./load-worker.ts", import.meta.url), {
			workerData: modules,
		});
		worker.on("message", (result: LoadResult) => {
			results.set(
				result.module,
				"failed" in result
					? result
					: {
							module: result.module,
							exported: result.json === undefined ? undefined : JSON.parse(result.json),
							declarations: result.declarations,
						},
			);
			if (results.size === modules.length) {
				// A module may have left timers running; its results are all in.
				void worker.terminate();
			}
		});
		worker.on("error", (error) => {
			failure = `the module loader stopped: ${error.message}`;
		});
		worker.on("exit", finish);
	});
}
