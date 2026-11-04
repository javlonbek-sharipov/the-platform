/** The builder for architecture Diagrams. */

import type { ArchitectureEdgeKind, ArchitectureNodeKind } from "../notations/architecture.ts";
import { callerOf, type Declarations, declarationsKey } from "./declarations.ts";
import {
	type Diagram,
	type Direction,
	type Edge,
	endNode,
	type Link,
	type Node,
	type Row,
	type RowEnd,
} from "./model.ts";

export interface ArchitectureOptions {
	/** Only for Diagrams built outside the Atlas, which assigns ids from paths. */
	id?: string;
	title: string;
	/** Which way the ranks run: `right`, the default, or `down`. */
	direction?: Direction;
}

/**
 * A Node to declare. It's a plain object, so a Node can be defined once in a
 * shared module, with `satisfies ArchitectureNode`, and declared on several
 * Diagrams.
 */
export interface ArchitectureNode {
	id: string;
	kind: ArchitectureNodeKind;
	title: string;
	/** Shown below the header, each with its name on the left and its value on the right. */
	rows?: readonly Row[];
	links?: readonly Link[];
}

/** What a Node declaration returns. Later calls accept it in place of the id. */
export interface NodeHandle {
	readonly id: string;
	/** An Edge end at one of the Node's Rows, by its name. */
	row(name: string): RowEnd;
}

export interface EdgeHandle {
	readonly id: string;
}

/**
 * An Edge end: a Node handle, or the id of a Node declared on the same
 * Diagram, or one of a Node's Rows, as `handle.row(name)` gives it or as
 * `{ node: id, row: name }`.
 */
export type EdgeEnd = NodeHandle | RowEnd | string;

export interface EdgeOptions {
	kind: ArchitectureEdgeKind;
	/** Defaults to the two ends' ids, as in `checkout-api->payments-api`. */
	id?: string;
}

export interface ArchitectureBuilder {
	node(node: ArchitectureNode): NodeHandle;
	edge(from: EdgeEnd, to: EdgeEnd, options: EdgeOptions): EdgeHandle;
}

/**
 * Builds an architecture Diagram. The result is the JSON model itself. Beside
 * it, under a key that JSON leaves out, it records where each declaration was
 * called from, so that the Atlas can point diagnostics at their lines.
 */
export function architecture(
	options: ArchitectureOptions,
	build: (diagram: ArchitectureBuilder) => void,
): Diagram {
	const nodes: Node[] = [];
	const edges: Edge[] = [];
	const members: string[] = [];
	const declarations: Declarations = {};
	const declare = (pointer: string, callee: (...args: never[]) => unknown) => {
		const position = callerOf(callee);
		if (position !== undefined) {
			declarations[pointer] = position;
		}
	};
	declare("", architecture);

	const builder: ArchitectureBuilder = {
		node({ id, kind, title, rows, links }) {
			declare(`/nodes/${nodes.length}`, builder.node);
			nodes.push({
				id,
				kind,
				title,
				...(rows === undefined
					? {}
					: {
							rows: rows.map(({ name, value }) =>
								value === undefined ? { name } : { name, value },
							),
						}),
				...(links === undefined ? {} : { links: links.map((link) => ({ ...link })) }),
			});
			members.push(id);
			return Object.freeze({ id, row: (name: string) => Object.freeze({ node: id, row: name }) });
		},
		edge(from, to, { kind, id }) {
			declare(`/edges/${edges.length}`, builder.edge);
			const fromEnd = modelEnd(from);
			const toEnd = modelEnd(to);
			// A default id names the two Nodes, whatever their Rows.
			const edge: Edge = {
				id: id ?? `${endNode(fromEnd)}->${endNode(toEnd)}`,
				kind,
				from: fromEnd,
				to: toEnd,
			};
			edges.push(edge);
			return Object.freeze({ id: edge.id });
		},
	};
	build(builder);

	const diagram: Diagram = {
		version: 1,
		notation: "architecture",
		...(options.id === undefined ? {} : { id: options.id }),
		title: options.title,
		direction: options.direction ?? "right",
		members,
		nodes,
		groups: [],
		edges,
		walkthroughs: [],
	};
	return Object.defineProperty(diagram, declarationsKey, { value: declarations });
}

/** An Edge end as the model writes it: a Node's id, or a Row end of its own. */
function modelEnd(end: EdgeEnd): Edge["from"] {
	if (typeof end === "string") {
		return end;
	}
	return "node" in end ? { node: end.node, row: end.row } : end.id;
}
