/**
 * Where a diagram module declared each thing, so that diagnostics can point at
 * the file and line. The builder keeps these beside the model, never in it, so
 * the JSON model stays the same however it was made.
 */

/** A place in a source file. Lines and columns count from 1. */
export interface SourcePosition {
	/** The module's URL, as the JavaScript engine reports it. */
	file: string;
	line: number;
	column: number;
}

/**
 * Where each declaration was called from, keyed by the JSON Pointer of what
 * it declared: `""` for the Diagram, `/nodes/2` for its third Node.
 */
export type Declarations = Record<string, SourcePosition>;

/**
 * The key under which a built Diagram holds its declarations, as a property
 * that JSON leaves out. It's a global symbol, so that every copy of the
 * engine finds it.
 */
export const declarationsKey: unique symbol = Symbol.for("@the-platform/diagrams/declarations");

type Callee = (...args: never[]) => unknown;

/**
 * Where `callee` was called from, read from the stack. Only engines with
 * `Error.captureStackTrace`, such as V8, report it; elsewhere it's undefined.
 */
export function callerOf(callee: Callee): SourcePosition | undefined {
	const holder: { stack?: unknown } = {};
	const { captureStackTrace } = Error as {
		captureStackTrace?: (target: object, callee: Callee) => void;
	};
	captureStackTrace?.(holder, callee);
	if (typeof holder.stack !== "string") {
		return undefined;
	}
	// The first frame with a position is the caller's. A frame before it may
	// have none, as when `Array.prototype.map` calls `callee` itself.
	for (const frame of holder.stack.split("\n")) {
		const position = framePosition(frame);
		if (position !== undefined) {
			return position;
		}
	}
	return undefined;
}

/** Reads one line of a V8 stack: `    at name (url:line:column)`, or `    at url:line:column`. */
export function framePosition(frame: string): SourcePosition | undefined {
	const at = /^\s+at (?:.* \((.+)\)|(.+))$/.exec(frame);
	const location = at?.[1] ?? at?.[2];
	const parts = location === undefined ? null : /^(.+):(\d+):(\d+)$/.exec(location);
	if (parts === null) {
		return undefined;
	}
	const [, url = "", line, column] = parts;
	// A module loaded with a query or a fragment keeps it in its frames.
	return { file: url.replace(/[?#].*$/, ""), line: Number(line), column: Number(column) };
}
