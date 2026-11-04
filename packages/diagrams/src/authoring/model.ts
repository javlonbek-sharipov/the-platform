/**
 * Version 1 of the JSON model: the one stable, versioned format (ADR-0003).
 * The authoring API produces it, and generators may write it directly.
 */

import type {
	ArchitectureEdgeKind,
	ArchitectureGroupKind,
	ArchitectureNodeKind,
	ArchitectureStatus,
} from "../notations/architecture.ts";

export type Direction = "right" | "down";

export interface Diagram {
	version: 1;
	notation: "architecture";
	/**
	 * The module's path from the repo root, minus `.diagram.ts`. The Atlas
	 * assigns it, so diagram modules leave it out.
	 */
	id?: string;
	title: string;
	direction: Direction;
	/** The ids of the top-level Nodes and Groups, in declaration order. */
	members: string[];
	nodes: Node[];
	groups: Group[];
	edges: Edge[];
	/** Walkthroughs come in slice 4. */
	walkthroughs: never[];
}

export interface Node {
	id: string;
	kind: ArchitectureNodeKind;
	title: string;
	/**
	 * What it's built with: the slug of a product, language or protocol, such
	 * as `postgres` or `go`, drawn in its header as its logo and its name.
	 */
	technology?: string;
	/** Whether the Node stands for something we don't own or run, such as a third-party API. */
	external?: boolean;
	status?: ArchitectureStatus;
	/** Drawn below the Node's header, one band each, in order. */
	rows?: Row[];
	links?: Link[];
	/** A short tag that draws attention to the Node, such as `single point of failure`. */
	callout?: string;
}

/**
 * A name and a value shown on a Node, such as `replicas: 3`. Every Row has a
 * pair of Ports, one on each side of its Node.
 */
export interface Row {
	name: string;
	value?: string;
}

/**
 * A labeled box drawn around Nodes and other Groups. Every Node and Group is
 * a member of exactly one parent: the Diagram itself, or one Group. So Groups
 * nest as a tree.
 */
export interface Group {
	id: string;
	kind: ArchitectureGroupKind;
	title: string;
	/** The ids of its Nodes and child Groups, in declaration order. */
	members: string[];
	description?: string;
	links?: Link[];
}

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

/**
 * Each end of an Edge is the id of a Node, whose header Port the Edge uses,
 * or one of the Node's Rows, whose Port on the matching side it uses instead.
 */
export interface Edge {
	id: string;
	kind: ArchitectureEdgeKind;
	/** Where the Edge leaves from. */
	from: string | RowEnd;
	/** Where the Edge enters. */
	to: string | RowEnd;
	/** What passes over the Edge, drawn beside it, such as `Places orders`. */
	label?: string;
	/**
	 * How it travels: the slug of a product or protocol, such as `grpc` or
	 * `kafka`, drawn below the label.
	 */
	technology?: string;
	/**
	 * How much passes over it: a number, an optional `k` or `M`, a slash, and
	 * `s`, `min` or `h`, as in `2k/s` or `30/min`. It's drawn below the label.
	 */
	rate?: string;
}

/** An Edge end at one of a Node's Rows. */
export interface RowEnd {
	/** The Node's id. */
	node: string;
	/** The Row's name. */
	row: string;
}

/** The id of the Node at an Edge end. */
export function endNode(end: string | RowEnd): string {
	return typeof end === "string" ? end : end.node;
}
