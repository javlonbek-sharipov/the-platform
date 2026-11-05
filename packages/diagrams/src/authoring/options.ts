/**
 * The options that the authoring API's functions take. The types reject any
 * other option, and so does validation, which is the authority: each function
 * records an option it doesn't know as an error beside the model, rather than
 * leave it behind, so that a misspelled option never just vanishes.
 */

import { type Diagnostic, list, pointerSegment } from "../core/diagnostics.ts";

/**
 * The key under which a built Diagram, or the Atlas config, holds an error for
 * each option that its functions didn't know, as a property that JSON leaves
 * out. It's a global symbol, so that every copy of the engine finds it.
 */
export const unknownOptionsKey: unique symbol = Symbol.for(
	"@the-platform/diagrams/unknown-options",
);

/**
 * The options of one of the authoring API's types, in the order messages list
 * them. The type checker makes the list name every option of the type and no
 * other, so an option added to a type can't be left out.
 */
export function optionsOf<T>(options: Record<keyof T, true>): readonly string[] {
	return Object.keys(options);
}

/**
 * The options that something takes: those it knows, in the order messages
 * list them. For a Node, a Group or an Edge, `all` holds every option that
 * the model has for it, of which its Notation's take only `known`, and
 * `notation` names that Notation.
 */
export interface KnownOptions {
	known: readonly string[];
	all?: readonly string[];
	notation?: string;
}

/**
 * A `model-shape` error for each option given that isn't one of those known,
 * at the pointer where it would go in the model. `thing` names what takes the
 * options, as in `An Edge`. An option set to `undefined` is no option, as it
 * is for the options a function knows.
 */
export function unknownOptions(
	given: object,
	{ known, all = known, notation }: KnownOptions,
	thing: string,
	pointer: string,
): Diagnostic[] {
	const options =
		known.length === 0
			? "It has no options yet."
			: `Its options are ${list(known.map((option) => `\`${option}\``))}.`;
	return Object.entries(given)
		.filter(([option, value]) => value !== undefined && !known.includes(option))
		.map(([option]) => ({
			severity: "error",
			rule: "model-shape",
			// An option that another Notation's things take is missing only from this one.
			message: `${thing} has no option \`${option}\`${all.includes(option) ? ` in the ${notation} Notation` : ""}. ${options}`,
			pointer: `${pointer}/${pointerSegment(option)}`,
		}));
}

/** The errors about unknown options that a built Diagram or config holds, if any. */
export function unknownOptionsOf(built: unknown): Diagnostic[] {
	const recorded =
		typeof built === "object" && built !== null
			? (built as { [unknownOptionsKey]?: unknown })[unknownOptionsKey]
			: undefined;
	return Array.isArray(recorded) ? (recorded as Diagnostic[]) : [];
}

/** Records the errors about unknown options beside what was built, where JSON leaves them out. */
export function recordUnknownOptions<T extends object>(built: T, errors: Diagnostic[]): T {
	return Object.defineProperty(built, unknownOptionsKey, { value: errors, configurable: true });
}
