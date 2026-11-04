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
}

export interface Edge {
	id: string;
	kind: ArchitectureEdgeKind;
	/** The id of the Node the Edge leaves from. */
	from: string;
	/** The id of the Node the Edge enters. */
	to: string;
}
