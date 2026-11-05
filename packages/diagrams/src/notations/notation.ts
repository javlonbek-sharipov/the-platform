/**
 * What a Notation's definition holds: everything about its Diagrams that
 * depends on Kinds. The rest of the engine reads each of them from the
 * definition, so a Notation is added by writing one, without touching the
 * core.
 */

import type { Bundling } from "../core/bundles.ts";
import type { Outline } from "../core/outlines.ts";
import type { ColorName, ThemeColor } from "../core/theme.ts";

export interface Notation {
	/** What a Diagram's `notation` names it by. */
	name: string;
	/**
	 * The fields its Diagrams may have: of the optional fields that the model
	 * has for a Node, a Group and an Edge, the ones that its own may have.
	 * Any other is an error on one of its Diagrams.
	 */
	fields: {
		node: readonly NodeField[];
		group: readonly GroupField[];
		edge: readonly EdgeField[];
	};
	/**
	 * The hues its Node Kinds are drawn in, by name. Each is a color of the
	 * theme, the CSS custom property `--diagram-hue-` and its name, with a
	 * fallback for the light theme and one for the dark theme. Kinds that
	 * belong together share one.
	 */
	hues: Record<string, ThemeColor>;
	/** Its Node Kinds, in the order messages list them, each with its look. */
	nodeKinds: Record<string, NodeKindDefinition>;
	/**
	 * The statuses its Nodes may have, which say how each is doing, in the
	 * order messages list them, each with its look.
	 */
	statuses: Record<string, StatusDefinition>;
	/**
	 * The facts that the SVG's description lists for each Node, after its
	 * title, in this order. A fact that a Node lacks, such as a status, is
	 * left out.
	 */
	facts: readonly NodeFact[];
	/**
	 * Its Group Kinds, in the order messages list them, each with its look,
	 * and whether an Edge crosses between two Groups of it.
	 */
	groupKinds: Record<string, GroupKindDefinition>;
	/**
	 * The roles that an end of one of its Edges may carry, in the order
	 * messages list them, such as a context map's `OHS`. Each is drawn at its
	 * end as a short tag that shows its name here. Each Edge Kind says which
	 * of them each of its ends may carry.
	 */
	roles: Record<string, RoleDefinition>;
	/**
	 * Its Edge Kinds, in the order messages list them, each with its look, its
	 * sentence form, whether it's symmetric, the Node Kinds it may join, and
	 * the roles its ends may carry.
	 */
	edgeKinds: Record<string, EdgeKindDefinition>;
	/**
	 * How its Edges bundle: which Edges of one Kind share a trunk, and so a
	 * lane, where their routes run together.
	 */
	bundling: Bundling;
}

/** How a Node of one Kind looks: its size, its outline, its badge and its hue. A Kind alone decides it. */
export interface NodeKindDefinition {
	/** The Node's size, in px, which its title never changes. Both are multiples of 16, twice the grid. */
	width: number;
	height: number;
	/** The shape drawn inside the Node's rectangle. */
	outline: Outline;
	/** The badge at the start of the header: path data for a glyph 16 px square, stroked. */
	badge: string;
	/** Which of the Notation's hues the Node takes, by its name. */
	hue: string;
}

/**
 * The optional fields that the model has for a Node, a Group and an Edge, in
 * the model's order. Each Notation's definition lists those that its
 * Diagrams may have.
 */
export const optionalFields = {
	node: ["technology", "external", "status", "rows", "description", "links", "callout"],
	group: ["description", "links"],
	edge: ["label", "technology", "rate", "roles"],
} as const;

export type NodeField = (typeof optionalFields.node)[number];
export type GroupField = (typeof optionalFields.group)[number];
export type EdgeField = (typeof optionalFields.edge)[number];

/**
 * Whether a Notation's Nodes, Groups or Edges may have a field of the model:
 * every field that isn't optional, and the optional ones that its definition
 * lists.
 */
export function hasField(
	notation: Notation,
	thing: keyof Notation["fields"],
	field: string,
): boolean {
	const optional: readonly string[] = optionalFields[thing];
	const listed: readonly string[] = notation.fields[thing];
	return !optional.includes(field) || listed.includes(field);
}

/**
 * A fact that a description can list for a Node: its Kind, its Technology's
 * name, that it's External, or its status.
 */
export type NodeFact = "kind" | "technology" | "external" | "status";

/**
 * How a status shows: a mark of its own shape and its own color, at the end
 * of its Node's header, so that color is never the only signal.
 */
export interface StatusDefinition {
	/** The mark, as path data in a box 12 px square. */
	mark: string;
	/** Whether the mark is stroked as lines, rather than filled. */
	line: boolean;
	/** The theme's color for it. */
	color: ColorName;
}

/**
 * How a Group of one Kind draws its box, and whether Edges cross between
 * Groups of it. A Kind alone decides both.
 */
export interface GroupKindDefinition {
	/** How wide its box's stroke is, in px. */
	stroke: number;
	/** Its box's line: solid or dashed. */
	line: "solid" | "dashed";
	/**
	 * Set when an Edge crosses between two Groups of this Kind, as it does
	 * between two of architecture's regions: how the description says so, such
	 * as `across regions`. Such an Edge is drawn in the warning color, with a
	 * badge. An Edge that crosses between Groups of several Kinds is flagged
	 * for the first of them in the definition.
	 */
	crossing?: string;
}

/** A role that an end of an Edge may carry, which says what part that end's Node plays. */
export interface RoleDefinition {
	/** What the description calls it: its name in full, such as `open host service`. */
	name: string;
}

/**
 * The roles that one end of an Edge may carry, of its Notation's roles: any
 * of those listed together, or one of them at most.
 */
export type EndRoles = { anyOf: readonly string[] } | { oneOf: readonly string[] };

/**
 * How an Edge of one Kind looks, how a sentence names it, which Nodes it
 * may join, and which roles its ends may carry. A Kind alone decides them.
 */
export interface EdgeKindDefinition {
	/** Its line: solid or dashed. */
	line: "solid" | "dashed";
	/**
	 * Its sentence form: the sentence that names an Edge of this Kind, for
	 * screen readers and the SVG's description. `{from}` and `{to}` stand for
	 * its two ends.
	 */
	sentence: string;
	/**
	 * Whether it runs both ways alike, as a partnership does. A symmetric Edge
	 * is drawn without an arrowhead and without chevrons.
	 */
	symmetric?: boolean;
	/**
	 * The Node Kinds it may join: those it may start at, and those it may end
	 * at. Left out, it may start, or end, at a Node of any Kind.
	 */
	from?: readonly string[];
	to?: readonly string[];
	/**
	 * The roles that each of its ends may carry. An end left out carries none.
	 * A symmetric Kind's ends are alike, so neither carries any.
	 */
	roles?: { from?: EndRoles; to?: EndRoles };
}

/** The names of a Notation's Node Kinds. */
export type NodeKindOf<N extends Notation> = keyof N["nodeKinds"] & string;

/** A Notation's Node Kinds, in its definition's order. */
export function nodeKindsOf<N extends Notation>(notation: N): NodeKindOf<N>[] {
	return Object.keys(notation.nodeKinds);
}

/** The names of a Notation's statuses. */
export type StatusOf<N extends Notation> = keyof N["statuses"] & string;

/** A Notation's statuses, in its definition's order. */
export function statusesOf<N extends Notation>(notation: N): StatusOf<N>[] {
	return Object.keys(notation.statuses);
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

/** The names of a Notation's roles. */
export type RoleOf<N extends Notation> = keyof N["roles"] & string;

/** A Notation's roles, in its definition's order. */
export function rolesOf<N extends Notation>(notation: N): RoleOf<N>[] {
	return Object.keys(notation.roles);
}

/**
 * The roles that one end of an Edge of a Kind may carry, as its definition
 * lists them, and whether it may carry only one of them.
 */
export function endRolesOf(
	kind: EdgeKindDefinition,
	end: "from" | "to",
): { roles: readonly string[]; one: boolean } {
	const allowed = kind.roles?.[end];
	if (allowed === undefined) {
		return { roles: [], one: false };
	}
	return "oneOf" in allowed
		? { roles: allowed.oneOf, one: true }
		: { roles: allowed.anyOf, one: false };
}

/**
 * What a definition says of one of its Kinds, such as
 * `definitionOf(notation.nodeKinds, node.kind)`. Validation checks every Kind
 * against the definition before anything is laid out or drawn, so a Kind that
 * the definition lacks is a bug.
 */
export function definitionOf<T>(kinds: Readonly<Record<string, T>>, kind: string): T {
	const definition = Object.hasOwn(kinds, kind) ? kinds[kind] : undefined;
	if (definition === undefined) {
		throw new Error(
			`The Notation's definition has no \`${kind}\`, which validation should have rejected`,
		);
	}
	return definition;
}
