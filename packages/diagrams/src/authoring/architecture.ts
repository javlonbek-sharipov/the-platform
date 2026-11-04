/** The builder for architecture Diagrams. */

import type {
	ArchitectureEdgeKind,
	ArchitectureGroupKind,
	ArchitectureNodeKind,
} from "../notations/architecture.ts";
import { callerOf, type Declarations, declarationsKey } from "./declarations.ts";
import type { Diagram, Direction, Edge, Group, Link, Node } from "./model.ts";

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
	links?: readonly Link[];
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

/** What a Node declaration returns. Later calls accept it in place of the id. */
export interface NodeHandle {
	readonly id: string;
}

/** What a Group declaration returns. */
export interface GroupHandle {
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

/**
 * Declares the members of one parent: the Diagram, or a Group. Each Node and
 * Group it declares joins that parent, so each one has exactly one parent by
 * construction. Edges belong to the Diagram, whichever builder declares them.
 */
export interface ArchitectureBuilder {
	node(node: ArchitectureNode): NodeHandle;
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
			node({ id, kind, title, links }) {
				declare(`/nodes/${nodes.length}`, builder.node);
				nodes.push({ id, kind, title, ...copyLinks(links) });
				parent.push(id);
				return Object.freeze({ id });
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
			edge(from, to, { kind, id }) {
				declare(`/edges/${edges.length}`, builder.edge);
				const fromId = endId(from);
				const toId = endId(to);
				const edge: Edge = { id: id ?? `${fromId}->${toId}`, kind, from: fromId, to: toId };
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

function endId(end: EdgeEnd): string {
	return typeof end === "string" ? end : end.id;
}

/** The model's own copy of each Link, so that a shared definition never changes with it. */
function copyLinks(links: readonly Link[] | undefined): { links?: Link[] } {
	return links === undefined ? {} : { links: links.map((link) => ({ ...link })) };
}
