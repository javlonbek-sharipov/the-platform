/**
 * What a Notation's definition holds: everything about its Diagrams that
 * depends on Kinds. The rest of the engine reads each of them from the
 * definition, so a Notation is added by writing one, without touching the
 * core.
 */

import type { Outline } from "../core/outlines.ts";
import type { ThemeColor } from "../core/theme.ts";

export interface Notation {
	/** What a Diagram's `notation` names it by. */
	name: string;
	/**
	 * The hues its Node Kinds are drawn in, by name. Each is a color of the
	 * theme, the CSS custom property `--diagram-hue-` and its name, with a
	 * fallback for the light theme and one for the dark theme. Kinds that
	 * belong together share one.
	 */
	hues: Record<string, ThemeColor>;
	/** Its Node Kinds, in the order messages list them, each with its look. */
	nodeKinds: Record<string, NodeKindDefinition>;
}

/** How a Node of one Kind looks. A Kind alone decides it. */
export interface NodeKindDefinition {
	/** The Node's size, in px, which its title never changes. Both are multiples of 16, twice the grid. */
	width: number;
	height: number;
	/** The shape drawn inside the Node's rectangle. */
	outline: Outline;
	/** The badge at the start of the header: path data for a glyph 16 px square, stroked. */
	badge: string;
	/** Which of the Notation's hues the Node takes. */
	hue: string;
}

/** The names of a Notation's Node Kinds. */
export type NodeKindOf<N extends Notation> = keyof N["nodeKinds"] & string;

/** A Notation's Node Kinds, in its definition's order. */
export function nodeKindsOf<N extends Notation>(notation: N): NodeKindOf<N>[] {
	return Object.keys(notation.nodeKinds);
}

/**
 * How a Node of a Kind looks. Validation has checked every Kind against the
 * definition before anything is drawn, so a Kind it lacks is a bug.
 */
export function nodeLookOf(notation: Notation, kind: string): NodeKindDefinition {
	const look = notation.nodeKinds[kind];
	if (look === undefined) {
		throw new Error(`The ${notation.name} Notation has no Node Kind ${kind}`);
	}
	return look;
}
