import { Worker } from "node:worker_threads";
import type { Declarations } from "../authoring/declarations.ts";
import type { Diagnostic } from "../core/diagnostics.ts";
import type { FilePlace } from "./messages.ts";

/** Where an error was thrown, or where a syntax error is. Node gives no column for a syntax error. */
export type Place = FilePlace & { line: number };

/**
 * What loading one module gave: its default export, with the positions of
 * the declarations that built it and the errors about options its authoring
 * functions didn't know, or why it failed.
 *
 * - `import`: importing the module, or a module it imports, threw.
 * - `json`: its default export can't be written as JSON.
 */
export type Loaded = { module: string; dependencies: string[] } & (
	| { exported: unknown; declarations: Declarations; unknownOptions: Diagnostic[] }
	| { failed: "import" | "json"; reason: string; at?: Place }
);

/** What the worker posts for one module: its default export as JSON, or why it failed. */
export type LoadResult =
	| {
			module: string;
			dependencies: string[];
			json: string | undefined;
			declarations: Declarations;
			unknownOptions: Diagnostic[];
	  }
	| Extract<Loaded, { failed: unknown }>;

export interface LoadOptions {
	signal?: AbortSignal;
	/** Called as imports resolve, so a preview can watch imports during a build too. */
	onDependency?: (file: string) => void;
}

export type LoadMessage =
	| { type: "dependency"; file: string }
	| { type: "result"; result: LoadResult };

/**
 * Loads modules in a fresh worker thread, so that edits to them and to the
 * modules they import are always picked up.
 */
export function load(modules: string[], options: LoadOptions = {}): Promise<Loaded[]> {
	options.signal?.throwIfAborted();
	if (modules.length === 0) {
		return Promise.resolve([]);
	}
	return new Promise((resolve, reject) => {
		const results = new Map<string, Loaded>();
		let failure = "the module loader stopped before it reached this module.";
		const finish = () => {
			options.signal?.removeEventListener("abort", abort);
			if (options.signal?.aborted) {
				reject(options.signal.reason);
				return;
			}
			resolve(
				modules.map(
					(module) =>
						results.get(module) ?? {
							module,
							dependencies: [module],
							failed: "import",
							reason: failure,
						},
				),
			);
		};
		const worker = new Worker(new URL("./load-worker.ts", import.meta.url), {
			workerData: modules,
		});
		const abort = () => {
			void worker.terminate();
		};
		options.signal?.addEventListener("abort", abort, { once: true });
		worker.on("message", (message: LoadMessage) => {
			// Node's --watch may post its own dependency messages. Only consume our protocol.
			if (message.type === "dependency") {
				options.onDependency?.(message.file);
				return;
			}
			if (message.type !== "result") return;
			const { result } = message;
			results.set(
				result.module,
				"failed" in result
					? result
					: {
							module: result.module,
							dependencies: result.dependencies,
							exported: result.json === undefined ? undefined : JSON.parse(result.json),
							declarations: result.declarations,
							unknownOptions: result.unknownOptions,
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
