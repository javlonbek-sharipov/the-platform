/**
 * What every Notation's builder shares: the functions that declare Nodes,
 * Groups and Edges, the handles they return, Groups that declare their
 * members in a callback, Rows whose names the types carry, an error for each
 * option a function doesn't know, and the place each declaration was called
 * from. A Notation's builder is `builderOf` its definition, which gives the
 * functions their Kinds, their statuses and the options their things take.
 */

import type { Technology } from "../core/technology.ts";
import {
	type EdgeField,
	type EdgeKindOf,
	type GroupField,
	type GroupKindOf,
	hasField,
	type NodeField,
	type NodeKindOf,
	type Notation,
	optionalFields,
	type StatusOf,
} from "../notations/notation.ts";
import { callerOf, type Declarations, declarationsKey } from "./declarations.ts";
import {
	type AnyDiagram,
	type AnyEdge,
	type AnyGroup,
	type AnyNode,
	type DiagramOf,
	type Direction,
	endNode,
	type Link,
	type RowEnd,
} from "./model.ts";
import { optionsOf, recordUnknownOptions, unknownOptions } from "./options.ts";

/** What a Diagram is declared with, whatever its Notation. */
export interface DiagramDeclaration {
	/** Only for Diagrams built outside the Atlas, which assigns ids from paths. */
	id?: string;
	title: string;
	/** What the Diagram shows, which isn't drawn. The SVG carries it in its model. */
	description?: string;
	/** Which way the ranks run: `right`, the default, or `down`. */
	direction?: Direction;
}

/**
 * What a thing is declared with: the options it always takes, and those of
 * its optional ones that its Notation's definition lists.
 */
type Options<Always, Optional, Listed extends keyof Optional> = Always &
	Partial<Pick<Optional, Listed>>;

/** The options that a Node may take, of which a Notation's Nodes take those its definition lists. */
interface NodeOptions<N extends Notation, R extends string> {
	/**
	 * What it's built with: a product, language or protocol's slug, such as
	 * `postgres` or `go`, drawn in its header as its logo and its name. Editors
	 * offer the slugs that have a logo, but any slug works.
	 */
	technology: Technology;
	/** Whether the Node stands for something we don't own or run, drawn with a dashed outline. */
	external: boolean;
	/** How the Node is doing, shown as a mark at the end of its header. */
	status: StatusOf<N>;
	/** Shown below the header, each with its name on the left and its value on the right. */
	rows: readonly RowDeclaration<R>[];
	/** What the Node is, which isn't drawn. The SVG carries it in its model. */
	description: string;
	links: readonly Link[];
	/** A short tag above the Node that draws attention to it, such as `single point of failure`. */
	callout: string;
}

/**
 * A Node to declare on a Diagram of the Notation `N`. It's a plain object,
 * so a Node can be defined once in a shared module and declared on several
 * Diagrams. Written `as const`, it keeps its Rows' names for the handle that
 * each declaration returns.
 *
 * `R` is the names of its Rows.
 */
export type NodeDeclaration<N extends Notation, R extends string = string> = Options<
	{ id: string; kind: NodeKindOf<N>; title: string },
	NodeOptions<N, R>,
	N["fields"]["node"][number] & NodeField
>;

/** A Row to declare on a Node, such as `{ name: "replicas", value: "3" }`. */
export interface RowDeclaration<R extends string = string> {
	/** It names the Row for the Edge ends that attach to it, so each Row of a Node needs its own. */
	name: R;
	value?: string;
}

/** The options that a Group may take, of which a Notation's Groups take those its definition lists. */
interface GroupOptions {
	/** What the Group is, which isn't drawn. The SVG carries it in its model. */
	description: string;
	links: readonly Link[];
}

/**
 * A Group to declare on a Diagram of the Notation `N`. Like a Node, it's a
 * plain object, so one definition can serve several Diagrams.
 */
export type GroupDeclaration<N extends Notation> = Options<
	{ id: string; kind: GroupKindOf<N>; title: string },
	GroupOptions,
	N["fields"]["group"][number] & GroupField
>;

/** The options that an Edge may take, of which a Notation's Edges take those its definition lists. */
interface EdgeOptions {
	/** What passes over the Edge, drawn beside it, such as `Places orders`. */
	label: string;
	/**
	 * How it travels: a product or protocol's slug, such as `grpc` or `kafka`,
	 * drawn below the label, after its logo if it has one. Editors offer the
	 * slugs that have a logo, but any slug works.
	 */
	technology: Technology;
	/** How much passes over it, as in `2k/s` or `30/min`: drawn below the label. */
	rate: string;
}

/** What an Edge is declared with, between its two ends, on a Diagram of the Notation `N`. */
export type EdgeDeclaration<N extends Notation> = Options<
	{
		kind: EdgeKindOf<N>;
		/** Defaults to the two ends' ids, as in `checkout-api->payments-api`. */
		id?: string;
	},
	EdgeOptions,
	N["fields"]["edge"][number] & EdgeField
>;

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

/**
 * Declares the members of one parent: the Diagram, or a Group. Each Node and
 * Group it declares joins that parent, so each one has exactly one parent by
 * construction. Edges belong to the Diagram, whichever builder declares them.
 */
export interface Builder<N extends Notation> {
	node<R extends string = never>(node: NodeDeclaration<N, R>): NodeHandle<R>;
	/** Declares a Group, whose members `build` declares with the builder it's given. */
	group(group: GroupDeclaration<N>, build: (group: Builder<N>) => void): GroupHandle;
	edge(from: EdgeEnd, to: EdgeEnd, options: EdgeDeclaration<N>): EdgeHandle;
}

/**
 * Every option that each function of a builder may take, in the order
 * messages list them. A Notation's builder takes those that its Nodes,
 * Groups and Edges may have.
 */
const options = {
	diagram: optionsOf<DiagramDeclaration>({
		id: true,
		title: true,
		description: true,
		direction: true,
	}),
	node: optionsOf<NodeDeclaration<Notation>>({
		id: true,
		kind: true,
		title: true,
		technology: true,
		external: true,
		status: true,
		rows: true,
		description: true,
		links: true,
		callout: true,
	}),
	row: optionsOf<RowDeclaration>({ name: true, value: true }),
	group: optionsOf<GroupDeclaration<Notation>>({
		id: true,
		kind: true,
		title: true,
		description: true,
		links: true,
	}),
	edge: optionsOf<EdgeDeclaration<Notation>>({
		kind: true,
		id: true,
		label: true,
		technology: true,
		rate: true,
	}),
};

/**
 * The builder of a Notation's Diagrams, from its definition. What it builds
 * is the JSON model itself. Beside it, under keys that JSON leaves out, it
 * records where each declaration was called from, so that the Atlas can
 * point diagnostics at their lines, and an error for each option it doesn't
 * know, so that validation rejects it.
 */
export function builderOf<const N extends Notation>(
	notation: N,
): (options: DiagramDeclaration, build: (diagram: Builder<N>) => void) => DiagramOf<N> {
	/** The options that one of the Notation's things takes, and every option that the model has for it. */
	const optionsOfIts = (thing: "node" | "group" | "edge") => ({
		known: options[thing].filter((option) => hasField(notation, thing, option)),
		all: options[thing],
		notation: notation.name,
	});
	const known = {
		node: optionsOfIts("node"),
		group: optionsOfIts("group"),
		edge: optionsOfIts("edge"),
	};
	/**
	 * The optional fields of a declared thing, as the model holds them: those
	 * that the Notation's things may have and that the declaration gives, in
	 * the model's order.
	 */
	const fieldsOf = <F extends string>(
		thing: "node" | "group" | "edge",
		declared: object,
		copy: (field: F, value: unknown) => unknown = (_, value) => value,
	): Record<string, unknown> => {
		const given: Partial<Record<string, unknown>> = declared;
		const fields: readonly string[] = optionalFields[thing];
		return Object.fromEntries(
			fields
				.filter((field) => hasField(notation, thing, field) && given[field] !== undefined)
				.map((field) => [field, copy(field as F, given[field])]),
		);
	};

	const diagram = (
		declared: DiagramDeclaration,
		build: (diagram: Builder<N>) => void,
	): DiagramOf<N> => {
		const nodes: AnyNode[] = [];
		const groups: AnyGroup[] = [];
		const edges: AnyEdge[] = [];
		const members: string[] = [];
		const declarations: Declarations = {};
		const declare = (pointer: string, callee: (...args: never[]) => unknown) => {
			const position = callerOf(callee);
			if (position !== undefined) {
				declarations[pointer] = position;
			}
		};
		declare("", diagram);
		const unknown = unknownOptions(declared, { known: options.diagram }, "The Diagram", "");

		/** A builder whose Nodes and Groups join `parent`, the members list of the Diagram or of one Group. */
		const builderFor = (parent: string[]): Builder<N> => {
			const builder: Builder<N> = {
				node(node) {
					const at = `/nodes/${nodes.length}`;
					declare(at, builder.node);
					const { id, kind, title, rows } = node as NodeDeclaration<Notation>;
					unknown.push(...unknownOptions(node, known.node, "A Node", at));
					rows?.forEach((row, index) => {
						unknown.push(
							...unknownOptions(row, { known: options.row }, "A Row", `${at}/rows/${index}`),
						);
					});
					nodes.push({
						id,
						kind,
						title,
						...fieldsOf<NodeField>("node", node, (field, value) =>
							field === "rows"
								? copyRows(value as readonly RowDeclaration[])
								: field === "links"
									? copyLinks(value as readonly Link[])
									: value,
						),
					});
					parent.push(id);
					return Object.freeze({
						id,
						row: (name: string) => Object.freeze({ node: id, row: name }),
					});
				},
				group(definition, buildGroup) {
					const at = `/groups/${groups.length}`;
					declare(at, builder.group);
					const { id, kind, title } = definition;
					unknown.push(...unknownOptions(definition, known.group, "A Group", at));
					const group: AnyGroup = {
						id,
						kind,
						title,
						members: [],
						...fieldsOf<GroupField>("group", definition, (field, value) =>
							field === "links" ? copyLinks(value as readonly Link[]) : value,
						),
					};
					groups.push(group);
					parent.push(id);
					buildGroup(builderFor(group.members));
					return Object.freeze({ id });
				},
				edge(from, to, declaredEdge) {
					const at = `/edges/${edges.length}`;
					declare(at, builder.edge);
					const { kind, id } = declaredEdge;
					unknown.push(...unknownOptions(declaredEdge, known.edge, "An Edge", at));
					const fromEnd = modelEnd(from);
					const toEnd = modelEnd(to);
					// A default id names the two Nodes, whatever their Rows.
					const edge: AnyEdge = {
						id: id ?? `${endNode(fromEnd)}->${endNode(toEnd)}`,
						kind,
						from: fromEnd,
						to: toEnd,
						...fieldsOf<EdgeField>("edge", declaredEdge),
					};
					edges.push(edge);
					return Object.freeze({ id: edge.id });
				},
			};
			return builder;
		};
		build(builderFor(members));

		const model: AnyDiagram = {
			version: 1,
			notation: notation.name,
			...(declared.id === undefined ? {} : { id: declared.id }),
			title: declared.title,
			...(declared.description === undefined ? {} : { description: declared.description }),
			direction: declared.direction ?? "right",
			members,
			nodes,
			groups,
			edges,
			walkthroughs: [],
		};
		Object.defineProperty(model, declarationsKey, { value: declarations });
		// The declarations' types hold what was built to its Notation's Kinds and
		// fields, which the type checker can't follow through the loops above.
		const built: unknown = recordUnknownOptions(model, unknown);
		return built as DiagramOf<N>;
	};
	return diagram;
}

/** An Edge end as the model writes it: a Node's id, or a Row end of its own. */
function modelEnd(end: EdgeEnd): string | RowEnd {
	if (typeof end === "string") {
		return end;
	}
	return "node" in end ? { node: end.node, row: end.row } : end.id;
}

/** The model's own Rows, each a name and, if it has one, a value. */
function copyRows(rows: readonly RowDeclaration[]): { name: string; value?: string }[] {
	return rows.map(({ name, value }) => (value === undefined ? { name } : { name, value }));
}

/** The model's own copy of each Link, so that a shared definition never changes with it. */
function copyLinks(links: readonly Link[]): Link[] {
	return links.map((link) => ({ ...link }));
}
