/** The builder for architecture Diagrams. */

import type { ArchitectureEdgeKind, ArchitectureNodeKind } from "../notations/architecture.ts";
import type { Diagram, Edge, Node } from "./model.ts";

export interface ArchitectureOptions {
	/** Only for Diagrams built outside the Atlas, which assigns ids from paths. */
	id?: string;
	title: string;
}

export interface ArchitectureNode {
	id: string;
	kind: ArchitectureNodeKind;
	title: string;
}

/** What a Node declaration returns. Later calls accept it in place of the id. */
export interface NodeHandle {
	readonly id: string;
}

export interface EdgeHandle {
	readonly id: string;
}

/** An Edge end: a Node handle, or the id of a Node declared on the same Diagram. */
export type EdgeEnd = NodeHandle | string;

export interface EdgeOptions {
	kind: ArchitectureEdgeKind;
	/** Defaults to the two ends' ids, as in `checkout-api->payments-api`. */
	id?: string;
}

export interface ArchitectureBuilder {
	node(node: ArchitectureNode): NodeHandle;
	edge(from: EdgeEnd, to: EdgeEnd, options: EdgeOptions): EdgeHandle;
}

export function architecture(
	options: ArchitectureOptions,
	build: (diagram: ArchitectureBuilder) => void,
): Diagram {
	const nodes: Node[] = [];
	const edges: Edge[] = [];
	const members: string[] = [];

	build({
		node({ id, kind, title }) {
			nodes.push({ id, kind, title });
			members.push(id);
			return Object.freeze({ id });
		},
		edge(from, to, { kind, id }) {
			const fromId = endId(from);
			const toId = endId(to);
			const edge: Edge = { id: id ?? `${fromId}->${toId}`, kind, from: fromId, to: toId };
			edges.push(edge);
			return Object.freeze({ id: edge.id });
		},
	});

	return {
		version: 1,
		notation: "architecture",
		...(options.id === undefined ? {} : { id: options.id }),
		title: options.title,
		direction: "right",
		members,
		nodes,
		groups: [],
		edges,
		walkthroughs: [],
	};
}

function endId(end: EdgeEnd): string {
	return typeof end === "string" ? end : end.id;
}
