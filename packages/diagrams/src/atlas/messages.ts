/** The Atlas's messages: diagnostics, each with the place in a file that it's about. */

import type { Declarations, SourcePosition } from "../authoring/declarations.ts";
import type { Diagnostic } from "../core/diagnostics.ts";

/**
 * A place in a file: the file's path, and the line and column there, where
 * they're known. A declaration's position, from the builder, knows both.
 */
export type FilePlace = Pick<SourcePosition, "file"> & Partial<Omit<SourcePosition, "file">>;

/**
 * A diagnostic, with the file it's about, and the line and column that
 * declared the thing where that's known.
 */
export interface AtlasMessage extends Diagnostic, FilePlace {}

/**
 * A diagnostic about a Diagram, placed at the declaration of the part of the
 * model it points at, or else at the module.
 */
export function located(
	module: string,
	declarations: Declarations,
	diagnostic: Diagnostic,
): AtlasMessage {
	return { ...(declaredAt(declarations, diagnostic.pointer) ?? { file: module }), ...diagnostic };
}

/** Where the part of the model at `pointer` was declared: by its own declaration, or its nearest parent's. */
function declaredAt(
	declarations: Declarations,
	pointer: string | undefined,
): SourcePosition | undefined {
	if (pointer === undefined) {
		return undefined;
	}
	for (let at = pointer; ; at = at.slice(0, at.lastIndexOf("/"))) {
		const position = declarations[at];
		if (position !== undefined || at === "") {
			return position;
		}
	}
}

/** `file:line:column`, leaving out what isn't known. */
export function placeText(place: FilePlace): string {
	return [place.file, place.line, place.column].filter((part) => part !== undefined).join(":");
}
