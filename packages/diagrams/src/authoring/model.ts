/**
 * Version 1 of the JSON model: the one stable, versioned format (ADR-0003).
 * The authoring API produces it, and generators may write it directly.
 */

import type { ArchitectureEdgeKind, ArchitectureNodeKind } from "../notations/architecture.ts";

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
	/** Groups come with ticket 06. */
	groups: never[];
	edges: Edge[];
	/** Walkthroughs come in slice 4. */
	walkthroughs: never[];
}

export interface Node {
	id: string;
	kind: ArchitectureNodeKind;
	title: string;
	links?: Link[];
}

/**
 * A "see also" pointer from a Node, which isn't drawn on the Diagram. It
 * points at exactly one thing: an id or a document. Term Links come in
 * slice 2.
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

export interface Edge {
	id: string;
	kind: ArchitectureEdgeKind;
	/** The id of the Node the Edge leaves from. */
	from: string;
	/** The id of the Node the Edge enters. */
	to: string;
}
