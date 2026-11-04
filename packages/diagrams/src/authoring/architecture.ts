/** The builder for architecture Diagrams. */

import type {
	ArchitectureEdgeKind,
	ArchitectureGroupKind,
	ArchitectureNodeKind,
	ArchitectureStatus,
} from "../notations/architecture.ts";
import { callerOf, type Declarations, declarationsKey } from "./declarations.ts";
import {
	type Diagram,
	type Direction,
	type Edge,
	endNode,
	type Group,
	type Link,
	type Node,
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
 * Diagrams. Written `as const satisfies ArchitectureNode`, it keeps its Rows'
 * names for the handle that each declaration returns.
 *
 * `R` is the names of its Rows.
 */
export interface ArchitectureNode<R extends string = string> {
	id: string;
	kind: ArchitectureNodeKind;
	title: string;
	/**
	 * What it's built with: a product, language or protocol's slug, such as
	 * `postgres` or `go`, drawn in its header as its logo and its name.
	 */
	technology?: string;
	/** Whether the Node stands for something we don't own or run, drawn with a dashed outline. */
	external?: boolean;
	/** How the Node is doing, shown as a mark at the end of its header. */
	status?: ArchitectureStatus;
	/** Shown below the header, each with its name on the left and its value on the right. */
	rows?: readonly ArchitectureRow<R>[];
	links?: readonly Link[];
	/** A short tag above the Node that draws attention to it, such as `single point of failure`. */
	callout?: string;
}

/** A Row to declare on a Node, such as `{ name: "replicas", value: "3" }`. */
export interface ArchitectureRow<R extends string = string> {
	/** It names the Row for the Edge ends that attach to it, so each Row of a Node needs its own. */
	name: R;
	value?: string;
}

/**
 * A Group to declare. Like a Node, it's a plain object, so one definition can
 * serve several Diagrams: a `system` can be a Node on one and a Group on
 * another.
 */
export interface ArchitectureGroup {
	id: string;
	kind: ArchitectureGroupKind;
	title: string;
	description?: string;
	links?: readonly Link[];
}

/**
 * What a Node declaration returns. Later calls accept it in place of the id.
 * It carries the names of the Node's Rows, `R`, so that naming a Row the Node
 * doesn't have is a type error.
 */
export interface NodeHandle<R extends string = never> {
	readonly id: string;
	/** An Edge end at one of the Node's Rows, by its name. */
	row(name: R): RowEnd;
}

/** What a Group declaration returns. */
export interface GroupHandle {
	readonly id: string;
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
	/** What passes over the Edge, drawn beside it, such as `Places orders`. */
	label?: string;
	/** How it travels: a product or protocol's slug, such as `grpc` or `kafka`, drawn below the label. */
	technology?: string;
	/** How much passes over it, as in `2k/s` or `30/min`: drawn below the label. */
	rate?: string;
}

/**
 * Declares the members of one parent: the Diagram, or a Group. Each Node and
 * Group it declares joins that parent, so each one has exactly one parent by
 * construction. Edges belong to the Diagram, whichever builder declares them.
 */
export interface ArchitectureBuilder {
	node<R extends string = never>(node: ArchitectureNode<R>): NodeHandle<R>;
	/** Declares a Group, whose members `build` declares with the builder it's given. */
	group(group: ArchitectureGroup, build: (group: ArchitectureBuilder) => void): GroupHandle;
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
	const groups: Group[] = [];
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

	/** A builder whose Nodes and Groups join `parent`, the members list of the Diagram or of one Group. */
	const builderFor = (parent: string[]): ArchitectureBuilder => {
		const builder: ArchitectureBuilder = {
			node({ id, kind, title, technology, external, status, rows, links, callout }) {
				declare(`/nodes/${nodes.length}`, builder.node);
				nodes.push({
					id,
					kind,
					title,
					...(technology === undefined ? {} : { technology }),
					...(external === undefined ? {} : { external }),
					...(status === undefined ? {} : { status }),
					...(rows === undefined
						? {}
						: {
								rows: rows.map(({ name, value }) =>
									value === undefined ? { name } : { name, value },
								),
							}),
					...copyLinks(links),
					...(callout === undefined ? {} : { callout }),
				});
				parent.push(id);
				return Object.freeze({ id, row: (name: string) => Object.freeze({ node: id, row: name }) });
			},
			group({ id, kind, title, description, links }, buildGroup) {
				declare(`/groups/${groups.length}`, builder.group);
				const group: Group = {
					id,
					kind,
					title,
					members: [],
					...(description === undefined ? {} : { description }),
					...copyLinks(links),
				};
				groups.push(group);
				parent.push(id);
				buildGroup(builderFor(group.members));
				return Object.freeze({ id });
			},
			edge(from, to, { kind, id, label, technology, rate }) {
				declare(`/edges/${edges.length}`, builder.edge);
				const fromEnd = modelEnd(from);
				const toEnd = modelEnd(to);
				// A default id names the two Nodes, whatever their Rows.
				const edge: Edge = {
					id: id ?? `${endNode(fromEnd)}->${endNode(toEnd)}`,
					kind,
					from: fromEnd,
					to: toEnd,
					...(label === undefined ? {} : { label }),
					...(technology === undefined ? {} : { technology }),
					...(rate === undefined ? {} : { rate }),
				};
				edges.push(edge);
				return Object.freeze({ id: edge.id });
			},
		};
		return builder;
	};
	build(builderFor(members));

	const diagram: Diagram = {
		version: 1,
		notation: "architecture",
		...(options.id === undefined ? {} : { id: options.id }),
		title: options.title,
		direction: options.direction ?? "right",
		members,
		nodes,
		groups,
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

/** The model's own copy of each Link, so that a shared definition never changes with it. */
function copyLinks(links: readonly Link[] | undefined): { links?: Link[] } {
	return links === undefined ? {} : { links: links.map((link) => ({ ...link })) };
}
