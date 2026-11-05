/**
 * Version 1 of the JSON model: the one stable, versioned format (ADR-0003).
 * The authoring API produces it, and generators may write it directly, then
 * check it against the JSON Schema that the package ships for it,
 * `@the-platform/diagrams/diagram.schema.json`.
 *
 * A Diagram's Notation decides which Kinds and statuses its Nodes, Groups
 * and Edges may have, and which fields. So the model's types take them from
 * a Notation's definition: `DiagramOf` is a Diagram of one Notation, and
 * `Diagram` one of any of the engine's own.
 */

import type {
	EdgeField,
	EdgeKindOf,
	GroupField,
	GroupKindOf,
	NodeField,
	NodeKindOf,
	Notation,
	RoleOf,
	StatusOf,
} from "../notations/notation.ts";
import type { notations } from "../notations/notations.ts";

export type Direction = "right" | "down";

/** A Diagram written in the Notation `N`. */
export interface DiagramOf<N extends Notation> {
	version: 1;
	notation: N["name"];
	/**
	 * The module's path from the repo root, minus `.diagram.ts`. The Atlas
	 * assigns it, so diagram modules leave it out.
	 */
	id?: string;
	title: string;
	/** What the Diagram shows, which isn't drawn. The SVG carries it in its model. */
	description?: string;
	/**
	 * Which way the ranks run. The builder always writes it. Generated JSON may
	 * leave it out, and validation then fills in `right`, the default.
	 */
	direction: Direction;
	/** The ids of the top-level Nodes and Groups, in declaration order. */
	members: string[];
	nodes: NodeOf<N>[];
	groups: GroupOf<N>[];
	edges: EdgeOf<N>[];
	/** Walkthroughs come in slice 4. */
	walkthroughs: never[];
}

/**
 * An object of the model: the fields it always has, and those of its
 * optional fields that its Notation's definition lists.
 */
type Fields<Always, Optional, Listed extends keyof Optional> = Always &
	Partial<Pick<Optional, Listed>>;

/** The optional fields that the model has for a Node. */
interface NodeFields<N extends Notation> {
	/**
	 * The slug of the product, language or protocol the Node is built with,
	 * such as `postgres` or `go`, drawn in its header as its logo and its name.
	 */
	technology: string;
	/** Whether the Node stands for something we don't own or run, such as a third-party API. */
	external: boolean;
	/** How the Node is doing: one of its Notation's statuses. */
	status: StatusOf<N>;
	/** Drawn below the Node's header, one band each, in order. */
	rows: Row[];
	/** What the Node is, which isn't drawn. The SVG carries it in its model. */
	description: string;
	links: Link[];
	/** A short tag that draws attention to the Node, such as `single point of failure`. */
	callout: string;
}

/** A Node of a Diagram in the Notation `N`: one of its Node Kinds, with the fields its Nodes may have. */
export type NodeOf<N extends Notation> = Fields<
	{ id: string; kind: NodeKindOf<N>; title: string },
	NodeFields<N>,
	N["fields"]["node"][number] & NodeField
>;

/**
 * A name and a value shown on a Node, such as `replicas: 3`. Every Row has a
 * pair of Ports, one on each side of its Node.
 */
export interface Row {
	name: string;
	value?: string;
}

/** The optional fields that the model has for a Group. */
interface GroupFields {
	/** What the Group is, which isn't drawn. The SVG carries it in its model. */
	description: string;
	links: Link[];
}

/**
 * A Group of a Diagram in the Notation `N`: a labeled box drawn around Nodes
 * and other Groups. Every Node and Group is a member of exactly one parent:
 * the Diagram itself, or one Group. So Groups nest as a tree.
 */
export type GroupOf<N extends Notation> = Fields<
	{
		id: string;
		kind: GroupKindOf<N>;
		title: string;
		/** The ids of its Nodes and child Groups, in declaration order. */
		members: string[];
	},
	GroupFields,
	N["fields"]["group"][number] & GroupField
>;

/**
 * A "see also" pointer from a Node or a Group, which isn't drawn on the
 * Diagram. It points at exactly one thing: an id or a document. Term Links
 * come in slice 2.
 */
export type Link = IdLink | DocLink;

/** A Link to another id in the Atlas. */
export interface IdLink {
	id: string;
	/** Replaces the text shown for the Link. */
	label?: string;
	doc?: never;
	section?: never;
}

/** A Link to a Markdown document, such as an ADR or a spec, and optionally to one of its sections. */
export interface DocLink {
	/** The document's path from the repo root, such as `docs/adr/0001-clean-room.md`. */
	doc: string;
	/** A heading in the document, by its text or by its anchor. */
	section?: string;
	/** Replaces the text shown for the Link. */
	label?: string;
	id?: never;
}

/** The optional fields that the model has for an Edge. */
interface EdgeFields<N extends Notation> {
	/** What passes over the Edge, drawn beside it, such as `Places orders`. */
	label: string;
	/**
	 * How it travels: the slug of a product or protocol, such as `grpc` or
	 * `kafka`, drawn below the label.
	 */
	technology: string;
	/**
	 * How much passes over it: a number, an optional `k` or `M`, a slash, and
	 * `s`, `min` or `h`, as in `2k/s` or `30/min`. It's drawn below the label.
	 */
	rate: string;
	/**
	 * The roles that each end carries, of its Notation's roles, each drawn as
	 * a short tag at that end. Its Kind decides which roles each end may carry.
	 */
	roles: EdgeRoles<RoleOf<N>>;
}

/** The roles at the ends of an Edge: those where it leaves, and those where it enters. */
export interface EdgeRoles<R extends string = string> {
	from?: R[];
	to?: R[];
}

/**
 * An Edge of a Diagram in the Notation `N`. Each end of an Edge is the id of
 * a Node, whose header Port the Edge uses, or one of the Node's Rows, whose
 * Port on the matching side it uses instead.
 */
export type EdgeOf<N extends Notation> = Fields<
	{
		id: string;
		kind: EdgeKindOf<N>;
		/** Where the Edge leaves from. */
		from: string | RowEnd;
		/** Where the Edge enters. */
		to: string | RowEnd;
	},
	EdgeFields<N>,
	N["fields"]["edge"][number] & EdgeField
>;

/** An Edge end at one of a Node's Rows. */
export interface RowEnd {
	/** The Node's id. */
	node: string;
	/** The Row's name. */
	row: string;
}

/** A Diagram of each of the Notations: a union, told apart by `notation`. */
type DiagramOfEach<N> = N extends Notation ? DiagramOf<N> : never;

/** A Diagram in any of the engine's own Notations. */
export type Diagram = DiagramOfEach<(typeof notations)[number]>;
/** A Node of a Diagram in any of the engine's own Notations. */
export type Node = Diagram["nodes"][number];
/** A Group of a Diagram in any of the engine's own Notations. */
export type Group = Diagram["groups"][number];
/** An Edge of a Diagram in any of the engine's own Notations. */
export type Edge = Diagram["edges"][number];

/**
 * A Diagram in any Notation at all, as the core reads one once validation
 * has checked it against its own Notation: each Kind and status is a name
 * from that Notation's definition, and every optional field of the model is
 * one that it may have.
 */
export type AnyDiagram = DiagramOf<Notation>;
/** A Node, a Group and an Edge of a Diagram in any Notation at all. */
export type AnyNode = NodeOf<Notation>;
export type AnyGroup = GroupOf<Notation>;
export type AnyEdge = EdgeOf<Notation>;

/** The id of the Node at an Edge end. */
export function endNode(end: string | RowEnd): string {
	return typeof end === "string" ? end : end.node;
}

/** The Group that each Node or Group is a member of, by id, unless it's on the Diagram itself. */
export function parentsOf(diagram: AnyDiagram): Map<string, string> {
	const parents = new Map<string, string>();
	for (const group of diagram.groups) {
		for (const member of group.members) {
			parents.set(member, group.id);
		}
	}
	return parents;
}
