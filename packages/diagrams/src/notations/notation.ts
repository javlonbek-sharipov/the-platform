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
	/** Its Group Kinds, in the order messages list them, each with its look. */
	groupKinds: Record<string, GroupKindDefinition>;
	/** Its Edge Kinds, in the order messages list them, each with its look and its sentence form. */
	edgeKinds: Record<string, EdgeKindDefinition>;
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

/** How a Group of one Kind draws its box. A Kind alone decides it. */
export interface GroupKindDefinition {
	/** How wide its box's stroke is, in px. */
	stroke: number;
	/** Its box's line: solid or dashed. */
	line: "solid" | "dashed";
}

/** How an Edge of one Kind looks, and how a sentence names it. A Kind alone decides both. */
export interface EdgeKindDefinition {
	/** Its line: solid or dashed. */
	line: "solid" | "dashed";
	/**
	 * Its sentence form: the sentence that names an Edge of this Kind, for
	 * screen readers and the SVG's description. `{from}` and `{to}` stand for
	 * its two ends.
	 */
	sentence: string;
}

/** The names of a Notation's Node Kinds. */
export type NodeKindOf<N extends Notation> = keyof N["nodeKinds"] & string;

/** A Notation's Node Kinds, in its definition's order. */
export function nodeKindsOf<N extends Notation>(notation: N): NodeKindOf<N>[] {
	return Object.keys(notation.nodeKinds);
}

/** The names of a Notation's Group Kinds. */
export type GroupKindOf<N extends Notation> = keyof N["groupKinds"] & string;

/** A Notation's Group Kinds, in its definition's order. */
export function groupKindsOf<N extends Notation>(notation: N): GroupKindOf<N>[] {
	return Object.keys(notation.groupKinds);
}

/** The names of a Notation's Edge Kinds. */
export type EdgeKindOf<N extends Notation> = keyof N["edgeKinds"] & string;

/** A Notation's Edge Kinds, in its definition's order. */
export function edgeKindsOf<N extends Notation>(notation: N): EdgeKindOf<N>[] {
	return Object.keys(notation.edgeKinds);
}

/**
 * What a definition says of one of its Kinds, such as
 * `definitionOf(notation.nodeKinds, node.kind)`. Validation checks every Kind
 * against the definition before anything is laid out or drawn, so a Kind that
 * the definition lacks is a bug.
 */
export function definitionOf<T>(kinds: Readonly<Record<string, T>>, kind: string): T {
	const definition = kinds[kind];
	if (definition === undefined) {
		throw new Error(
			`The Notation's definition has no \`${kind}\`, which validation should have rejected`,
		);
	}
	return definition;
}
