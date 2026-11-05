/**
 * Validation is the authority on what a valid Diagram is, not the types:
 * generated JSON has no types, so everything they prevent is checked here.
 */

import {
	type AnyDiagram,
	type AnyEdge,
	type AnyGroup,
	type AnyNode,
	type Direction,
	type EdgeRoles,
	endNode,
	type Link,
	type Row,
	type RowEnd,
} from "../authoring/model.ts";
import { unknownOptionsOf } from "../authoring/options.ts";
import {
	type EdgeField,
	edgeKindsOf,
	endRolesOf,
	type GroupField,
	groupKindsOf,
	hasField,
	type NodeField,
	type Notation,
	nodeKindsOf,
	rolesOf,
	statusesOf,
} from "../notations/notation.ts";
import { codePointOf, type Diagnostic, list, pointerSegment } from "./diagnostics.ts";
import { type TextField, type TextOwner, textsOf } from "./texts.ts";

/** What validation found: only diagnostics, or a Diagram without errors and its Notation. */
export type Validation =
	| { diagnostics: Diagnostic[]; diagram?: undefined }
	| { diagnostics: Diagnostic[]; diagram: AnyDiagram; notation: Notation };

const kebabCase = "[a-z0-9]+(?:-[a-z0-9]+)*";
const id = `${kebabCase}(?:/${kebabCase})*`;
/**
 * How the model writes ids, Technologies and rates, as the patterns that the
 * JSON Schema holds too, so that both read each one alike.
 */
export const formats = {
	/** Lowercase kebab-case words, optionally namespaced by a context, as in `billing/order`. */
	id: `^${id}$`,
	/** An id, or an Edge's default name: its two ends' ids joined by `->`. */
	edgeId: `^${id}(?:->${id})?$`,
	/** A Technology's slug: lowercase words joined by hyphens, as in `postgres` or `aws-lambda`. */
	slug: `^${kebabCase}$`,
	/** A number, an optional `k` or `M`, a slash, and `s`, `min` or `h`, as in `2k/s` or `30/min`. */
	rate: "^[0-9]+(?:\\.[0-9]+)?[kM]?/(?:s|min|h)$",
};
const idPattern = new RegExp(formats.id);
const edgeIdPattern = new RegExp(formats.edgeId);
export const slugPattern = new RegExp(formats.slug);
const ratePattern = new RegExp(formats.rate);

/**
 * Which way a Diagram's ranks run when its model doesn't say. The builder
 * always says, but generated JSON may leave `direction` out.
 */
export const defaultDirection: Direction = "right";
const directions: unknown[] = [undefined, "right", "down"];

/**
 * The fields of one of the model's types, in the model's order. The type
 * checker makes the list name every field of the type and no other, so a
 * field added to the model can't be left out of validation.
 */
function fieldsOf<T>(fields: Record<keyof T, true>): readonly string[] {
	return Object.keys(fields);
}

/**
 * Every field that a version-1 model may have. Any other is an error, as the
 * types make it one, so that a misspelled field is never silently ignored. Of
 * the optional fields of a Node, a Group and an Edge, a Diagram may have only
 * those that its Notation's definition lists.
 */
const fields = {
	diagram: fieldsOf<AnyDiagram>({
		version: true,
		notation: true,
		id: true,
		title: true,
		description: true,
		direction: true,
		members: true,
		nodes: true,
		groups: true,
		edges: true,
		walkthroughs: true,
	}),
	node: fieldsOf<AnyNode>({
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
	row: fieldsOf<Row>({ name: true, value: true }),
	group: fieldsOf<AnyGroup>({
		id: true,
		kind: true,
		title: true,
		members: true,
		description: true,
		links: true,
	}),
	edge: fieldsOf<AnyEdge>({
		id: true,
		kind: true,
		from: true,
		to: true,
		label: true,
		technology: true,
		rate: true,
		roles: true,
	}),
	roles: fieldsOf<EdgeRoles>({ from: true, to: true }),
	rowEnd: fieldsOf<RowEnd>({ node: true, row: true }),
	link: fieldsOf<Link>({ id: true, doc: true, section: true, label: true }),
};

/**
 * Checks a Diagram against the model's rules and its Notation's, which is
 * the one of `notations` that it names.
 */
export function validate(input: unknown, notations: readonly Notation[]): Validation {
	const read = readNotation(input, notations);
	if ("diagnostics" in read) {
		return read;
	}
	const { notation } = read;
	const shape = checkShape(read.model, notation);
	if (shape.length > 0) {
		return { diagnostics: shape };
	}
	// Everything after validation reads the Diagram with its direction filled in.
	const diagram = {
		...read.model,
		direction: read.model.direction ?? defaultDirection,
	} as AnyDiagram;
	const nodeKinds: readonly string[] = nodeKindsOf(notation);
	const groupKinds: readonly string[] = groupKindsOf(notation);
	const edgeKinds: readonly string[] = edgeKindsOf(notation);
	const statuses: readonly string[] = statusesOf(notation);
	const diagnostics: Diagnostic[] = [];

	const nodeIds = new Set<string>();
	diagram.nodes.forEach((node, index) => {
		if (!idPattern.test(node.id)) {
			diagnostics.push(
				error(
					"id-format",
					`Node \`${node.id}\` has an id that isn't lowercase kebab-case. Write ids like \`payments-api\`.`,
					`/nodes/${index}/id`,
				),
			);
		}
		if (nodeIds.has(node.id)) {
			diagnostics.push(
				error(
					"duplicate-id",
					`Two Nodes have the id \`${node.id}\`. Node ids must be unique within a Diagram.`,
					`/nodes/${index}/id`,
				),
			);
		}
		nodeIds.add(node.id);
		if (!nodeKinds.includes(node.kind)) {
			diagnostics.push(
				error(
					"unknown-kind",
					`Node \`${node.id}\` has the Kind \`${node.kind}\`, which the ${notation.name} Notation doesn't have. ${owned("Node Kind", "Node Kinds", nodeKinds)}`,
					`/nodes/${index}/kind`,
				),
			);
		}
		if (node.status !== undefined && !statuses.includes(node.status)) {
			diagnostics.push(
				error(
					"unknown-status",
					`Node \`${node.id}\` has the status \`${node.status}\`, which the ${notation.name} Notation doesn't have. ${owned("status", "statuses", statuses)}`,
					`/nodes/${index}/status`,
				),
			);
		}
		diagnostics.push(
			...checkTechnology(`Node \`${node.id}\``, node.technology, `/nodes/${index}/technology`),
		);
		const rowNames = new Set<string>();
		node.rows?.forEach((row, rowIndex) => {
			if (rowNames.has(row.name)) {
				diagnostics.push(
					error(
						"duplicate-row",
						`Node \`${node.id}\` has two Rows named \`${row.name}\`. A Node's Rows need names of their own, since an Edge end names a Row by its name.`,
						`/nodes/${index}/rows/${rowIndex}/name`,
					),
				);
			}
			rowNames.add(row.name);
		});
		diagnostics.push(...checkLinkIds(`Node \`${node.id}\``, node.links, `/nodes/${index}`));
	});

	const groupIds = new Set<string>();
	diagram.groups.forEach((group, index) => {
		if (!idPattern.test(group.id)) {
			diagnostics.push(
				error(
					"id-format",
					`Group \`${group.id}\` has an id that isn't lowercase kebab-case. Write ids like \`eu-west\`.`,
					`/groups/${index}/id`,
				),
			);
		}
		const taken = groupIds.has(group.id)
			? "Two Groups"
			: nodeIds.has(group.id)
				? "A Node and a Group"
				: undefined;
		if (taken !== undefined) {
			diagnostics.push(
				error(
					"duplicate-id",
					`${taken} have the id \`${group.id}\`. Node and Group ids must be unique within a Diagram.`,
					`/groups/${index}/id`,
				),
			);
		}
		groupIds.add(group.id);
		diagnostics.push(...checkLinkIds(`Group \`${group.id}\``, group.links, `/groups/${index}`));
		if (!groupKinds.includes(group.kind)) {
			diagnostics.push(
				error(
					"unknown-kind",
					`Group \`${group.id}\` has the Kind \`${group.kind}\`, which the ${notation.name} Notation doesn't have. ${owned("Group Kind", "Group Kinds", groupKinds)}`,
					`/groups/${index}/kind`,
				),
			);
		}
	});

	// An Edge end names a Row by its name, among its Node's Rows.
	const rowsOf = new Map(diagram.nodes.map((node) => [node.id, node.rows ?? []]));
	const kindOf = new Map(diagram.nodes.map((node) => [node.id, node.kind]));
	const edgeIds = new Set<string>();
	diagram.edges.forEach((edge, index) => {
		if (!edgeIdPattern.test(edge.id)) {
			diagnostics.push(
				error(
					"id-format",
					`Edge \`${edge.id}\` has an id that isn't lowercase kebab-case. Write ids like \`payments-api\`, or like \`checkout-api->payments-api\`.`,
					`/edges/${index}/id`,
				),
			);
		}
		if (edgeIds.has(edge.id)) {
			diagnostics.push(
				error(
					"duplicate-id",
					`Two Edges have the id \`${edge.id}\`. Edge ids must be unique within a Diagram, so give Edges between the same two Nodes ids of their own.`,
					`/edges/${index}/id`,
				),
			);
		}
		edgeIds.add(edge.id);
		for (const [field, verb] of [
			["from", "starts"],
			["to", "ends"],
		] as const) {
			const end = edge[field];
			const node = endNode(end);
			const at = `/edges/${index}/${field}`;
			const atNode = typeof end === "string" ? at : `${at}/node`;
			if (!nodeIds.has(node)) {
				diagnostics.push(
					error(
						"edge-end",
						groupIds.has(node)
							? `Edge \`${edge.id}\` ${verb} at \`${node}\`, which is a Group. An Edge starts and ends at Nodes, never at Groups.`
							: `Edge \`${edge.id}\` ${verb} at \`${node}\`, which isn't a Node on this Diagram.`,
						atNode,
					),
				);
				continue;
			}
			// An Edge's ends have Kinds that its own Kind allows. An end or an Edge
			// of a Kind the Notation lacks has its own error.
			const allowed = edgeKinds.includes(edge.kind)
				? notation.edgeKinds[edge.kind]?.[field]
				: undefined;
			const kind = kindOf.get(node) ?? "";
			if (allowed !== undefined && nodeKinds.includes(kind) && !allowed.includes(kind)) {
				const kinds = list(
					allowed.map((name) => `\`${name}\``),
					"or",
				);
				diagnostics.push(
					error(
						"edge-end-kind",
						`Edge \`${edge.id}\` ${verb} at \`${node}\`, whose Kind is \`${kind}\`. An Edge of the Kind \`${edge.kind}\` may ${field === "from" ? "start" : "end"} only at a Node of the Kind ${kinds}.`,
						atNode,
					),
				);
			}
			if (typeof end !== "string") {
				const names = (rowsOf.get(node) ?? []).map((row) => row.name);
				if (!names.includes(end.row)) {
					// Row names may hold spaces, so each one is quoted.
					const quoted = names.map((name) => `\`${name}\``);
					const which =
						quoted.length === 0
							? "which has no Rows."
							: `which has no such Row. ${quoted.length === 1 ? `Its only Row is ${quoted[0]}` : `Its Rows are ${list(quoted)}`}.`;
					diagnostics.push(
						error(
							"edge-end",
							`Edge \`${edge.id}\` ${verb} at the Row \`${end.row}\` of \`${node}\`, ${which}`,
							`${at}/row`,
						),
					);
				}
			}
		}
		if (!edgeKinds.includes(edge.kind)) {
			diagnostics.push(
				error(
					"unknown-kind",
					`Edge \`${edge.id}\` has the Kind \`${edge.kind}\`, which the ${notation.name} Notation doesn't have. ${owned("Edge Kind", "Edge Kinds", edgeKinds)}`,
					`/edges/${index}/kind`,
				),
			);
		}
		diagnostics.push(
			...checkTechnology(`Edge \`${edge.id}\``, edge.technology, `/edges/${index}/technology`),
		);
		if (edge.rate !== undefined && !ratePattern.test(edge.rate)) {
			diagnostics.push(
				error(
					"rate-format",
					`Edge \`${edge.id}\` has the rate \`${edge.rate}\`, which isn't written as a rate. Write a number, an optional \`k\` or \`M\`, a slash, and \`s\`, \`min\` or \`h\`, as in \`2k/s\` or \`30/min\`.`,
					`/edges/${index}/rate`,
				),
			);
		}
		diagnostics.push(...checkEndRoles(edge, index, notation));
	});

	diagnostics.push(
		...checkDefaultEdgeIds(diagram),
		...checkNesting(diagram),
		...checkCharacters(diagram),
	);
	if (diagnostics.length === 0) {
		diagnostics.push(...checkNamespaces(diagram, notation));
	}
	if (diagnostics.length === 0) {
		diagnostics.push(...(notation.validation?.check(diagram) ?? []));
	}

	return diagnostics.some((diagnostic) => diagnostic.severity === "error")
		? { diagnostics }
		: { diagnostics, diagram, notation };
}

/** A namespaced Group's members carry its prefix and exactly one local id. */
function checkNamespaces(diagram: AnyDiagram, notation: Notation): Diagnostic[] {
	return diagram.groups.flatMap((group, index) => {
		if (notation.groupKinds[group.kind]?.namespace !== true) {
			return [];
		}
		const prefix = `${group.id}/`;
		return group.members.flatMap((member, at) =>
			member.startsWith(prefix) && !member.slice(prefix.length).includes("/")
				? []
				: [
						error(
							"namespace",
							`Group \`${group.id}\` has the member \`${member}\`, whose full id doesn't belong to its namespace. Write a local id in the builder, or a full id like \`${group.id}/order\` in JSON.`,
							`/groups/${index}/members/${at}`,
						),
					],
		);
	});
}

/**
 * What a message says there is of something, such as a Notation's Group
 * Kinds, after naming one that it lacks: each of them, the only one, or that
 * there are none. `thing` names one of them, and `things` several.
 */
function owned(thing: string, things: string, names: readonly string[]): string {
	const [only] = names;
	if (only === undefined) {
		return `It has no ${things}.`;
	}
	return names.length === 1 ? `Its only ${thing} is ${only}.` : `Its ${things} are ${list(names)}.`;
}

/**
 * The authoring API names an Edge without an id after its two Nodes, so two
 * Edges that join the same two Nodes would get the same name, whatever Rows
 * they attach to. Both must then be given ids. An Edge whose id is that name
 * keeps the default, and is an error when another Edge would get it too.
 * Two Edges that both keep it are already a `duplicate-id` error.
 */
function checkDefaultEdgeIds(diagram: AnyDiagram): Diagnostic[] {
	const nameOf = (edge: AnyEdge) => `${endNode(edge.from)}->${endNode(edge.to)}`;
	return diagram.edges.flatMap((edge, index) => {
		const name = nameOf(edge);
		const other = diagram.edges.find(
			(candidate) => candidate !== edge && candidate.id !== name && nameOf(candidate) === name,
		);
		if (edge.id !== name || other === undefined) {
			return [];
		}
		return [
			error(
				"default-edge-id",
				`Edge \`${edge.id}\` keeps the default id, which Edge \`${other.id}\` would get too, since both join \`${endNode(edge.from)}\` to \`${endNode(edge.to)}\`. Give each Edge between the same two Nodes an id of its own.`,
				`/edges/${index}/id`,
			),
		];
	});
}

const ends = ["from", "to"] as const;

/**
 * The roles at an Edge's ends. Each must be one of its Notation's roles, and
 * one that the Edge's Kind lets that end carry, alone where the Kind lets the
 * end carry only one. A symmetric Edge's ends are alike, so it takes no roles
 * at all. An Edge of a Kind that the Notation lacks has its error already, so
 * only the first rule judges its roles.
 */
function checkEndRoles(edge: AnyEdge, index: number, notation: Notation): Diagnostic[] {
	const roles: readonly string[] = rolesOf(notation);
	const at = `/edges/${index}/roles`;
	const quoted = (names: readonly string[]) => names.map((name) => `\`${name}\``);
	const has = (role: string, end: string) =>
		`Edge \`${edge.id}\` has the role \`${role}\` at its \`${end}\` end`;
	/** Each role that an end carries, with its place in the end's list, as the model orders them. */
	const carried = ends.flatMap((end) =>
		(edge.roles?.[end] ?? []).map((role, place) => ({ end, role, place })),
	);
	const unknown = carried
		.filter(({ role }) => !roles.includes(role))
		.map(({ end, role, place }) =>
			error(
				"unknown-role",
				`${has(role, end)}, which the ${notation.name} Notation doesn't have. ${owned("role", "roles", roles)}`,
				`${at}/${end}/${place}`,
			),
		);
	// An end lists each of its roles once, whatever the Edge's Kind.
	const repeated = ends.flatMap((end) => {
		const listed = edge.roles?.[end] ?? [];
		return [...new Set(listed.filter((role, place) => listed.indexOf(role) !== place))].map(
			(role) =>
				error(
					"edge-end-role",
					`Edge \`${edge.id}\` lists the role \`${role}\` twice at its \`${end}\` end. List each role once.`,
					`${at}/${end}`,
				),
		);
	});
	const listing = [...unknown, ...repeated];
	const known = carried.filter(({ role }) => roles.includes(role));
	const kind = Object.hasOwn(notation.edgeKinds, edge.kind)
		? notation.edgeKinds[edge.kind]
		: undefined;
	if (kind === undefined || known.length === 0) {
		return listing;
	}
	// A Kind may take no roles at all: one that's symmetric, or whose definition lists none.
	const takesNone =
		kind.symmetric === true
			? `its Kind, \`${edge.kind}\`, is symmetric: its two ends are alike, so it takes no roles`
			: ends.every((end) => endRolesOf(kind, end).roles.length === 0)
				? `an Edge of the Kind \`${edge.kind}\` takes none`
				: undefined;
	if (takesNone !== undefined) {
		return [
			...listing,
			error("edge-end-role", `Edge \`${edge.id}\` has roles, but ${takesNone}.`, at),
		];
	}
	const misplaced = ends.flatMap((end) => {
		const other = end === "from" ? "to" : "from";
		const allowed = endRolesOf(kind, end);
		const here = known.filter((role) => role.end === end);
		const each = here.flatMap(({ role, place }) => {
			if (allowed.roles.includes(role)) {
				return [];
			}
			// Where the role belongs instead, or else what this end may carry.
			const may = endRolesOf(kind, other).roles.includes(role)
				? `may carry \`${role}\` only at its \`${other}\` end`
				: allowed.roles.length === 0
					? "carries no roles there"
					: `may carry only ${list(quoted(allowed.roles), "or")} there`;
			return [
				error(
					"edge-end-role",
					`${has(role, end)}. An Edge of the Kind \`${edge.kind}\` ${may}.`,
					`${at}/${end}/${place}`,
				),
			];
		});
		// Where the end may carry only one of its roles, it has at most one of them.
		const together = [
			...new Set(here.map(({ role }) => role).filter((role) => allowed.roles.includes(role))),
		];
		const [first = "", second = ""] = quoted(together);
		const tooMany =
			allowed.one && together.length > 1
				? [
						error(
							"edge-end-role",
							`Edge \`${edge.id}\` has ${together.length === 2 ? `both ${first} and ${second}` : list(quoted(together))} at its \`${end}\` end. An Edge of the Kind \`${edge.kind}\` may carry only one of them there.`,
							`${at}/${end}`,
						),
					]
				: [];
		return [...each, ...tooMany];
	});
	return [...listing, ...misplaced];
}

/**
 * A Technology must be a slug. Any slug is valid: one without a logo is drawn
 * as its name, which isn't an error. `owner` is the Node or Edge that has it.
 */
function checkTechnology(
	owner: string,
	technology: string | undefined,
	pointer: string,
): Diagnostic[] {
	return technology === undefined || slugPattern.test(technology)
		? []
		: [
				error(
					"technology-format",
					`${owner} has the Technology \`${technology}\`, which isn't a slug. Write a Technology as lowercase words joined by hyphens, such as \`postgres\` or \`grpc\`.`,
					pointer,
				),
			];
}

/**
 * Every text in the model must be one that an SVG can hold. XML forbids some
 * characters even written as character references, so no escaping could
 * write them: control characters other than tabs and line breaks, halves of
 * surrogate pairs on their own, and U+FFFE and U+FFFF. A Technology and a
 * rate have formats that leave them out already, as ids and Kinds do.
 */
function checkCharacters(diagram: AnyDiagram): Diagnostic[] {
	return textsOf(diagram).flatMap(({ owner, field, text, pointer }) => {
		if (field.name === "technology" || field.name === "rate") {
			return [];
		}
		const found = [...new Set(text)].filter((character) => !writable(character));
		const [first] = found;
		if (first === undefined) {
			return [];
		}
		const where = textNamed(owner, field);
		const subject = `${where.charAt(0).toUpperCase()}${where.slice(1)}`;
		return [
			error(
				"invalid-character",
				found.length === 1
					? `${subject} has ${unwritableKind(first)}, ${codePointOf(first)}, which an SVG can't hold. Remove it.`
					: `${subject} has characters that an SVG can't hold: ${list(found.map(codePointOf))}. Remove them.`,
				pointer,
			),
		];
	});
}

/**
 * How a message names a text of the model, by its field and what holds it,
 * with each character that an SVG can't hold written as an escape.
 */
function textNamed(owner: TextOwner, field: TextField): string {
	const named = owner.thing === "Diagram" ? "the Diagram" : `${owner.thing} \`${shown(owner.id)}\``;
	switch (field.name) {
		case "row name":
		case "row value":
			return `the ${field.name === "row name" ? "name" : "value"} of ${named}'s Row \`${shown(field.row)}\``;
		case "link doc":
		case "link section":
		case "link label": {
			const part = { "link doc": "document", "link section": "section", "link label": "label" };
			return `the ${part[field.name]} of ${named}'s Link to \`${shown(field.target)}\``;
		}
		case "end row":
			return `the Row that ${named} ${field.end === "from" ? "starts" : "ends"} at`;
		default:
			return `${named}'s ${field.name}`;
	}
}

/**
 * Whether XML, and so an SVG, can hold the character: every character but
 * the control characters other than tab, line feed and carriage return; the
 * halves of surrogate pairs, on their own; and U+FFFE and U+FFFF.
 */
function writable(character: string): boolean {
	const code = character.codePointAt(0) ?? 0;
	return (
		(code >= 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) &&
		(code < 0xd800 || code > 0xdfff) &&
		code !== 0xfffe &&
		code !== 0xffff
	);
}

/** What kind of character an SVG can't hold this one is, for a message. */
function unwritableKind(character: string): string {
	const code = character.codePointAt(0) ?? 0;
	return code < 0x20
		? "a control character"
		: code >= 0xd800 && code <= 0xdfff
			? "an unpaired surrogate"
			: "a noncharacter";
}

/** The text with each character that an SVG can't hold written as an escape, such as `\u0007`. */
function shown(text: string): string {
	return [...text]
		.map((character) =>
			writable(character) ? character : codePointOf(character).replace("U+", "\\u"),
		)
		.join("");
}

/** A Link to an id must name it as the model writes ids. `owner` is the Node or Group that has the Links. */
function checkLinkIds(owner: string, links: Link[] | undefined, pointer: string): Diagnostic[] {
	return (links ?? []).flatMap((link, index) =>
		link.id === undefined || idPattern.test(link.id)
			? []
			: [
					error(
						"id-format",
						`${owner} has a Link to \`${link.id}\`, which isn't a lowercase kebab-case id. Write ids like \`payments-api\`.`,
						`${pointer}/links/${index}/id`,
					),
				],
	);
}

const oneParent = "Every Node and Group has exactly one parent: the Diagram, or one Group.";

/** A parent as messages name it: the Diagram, or one Group. */
function parentName(parent: string | undefined): string {
	return parent === undefined ? "the Diagram" : `Group \`${parent}\``;
}

/**
 * Every Node and Group is a member of exactly one parent: the Diagram itself,
 * or one Group. So Groups nest as a tree, rooted at the Diagram.
 */
function checkNesting(diagram: AnyDiagram): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const things = new Map<string, string>([
		...diagram.groups.map((group) => [group.id, "Group"] as const),
		...diagram.nodes.map((node) => [node.id, "Node"] as const),
	]);
	// An id that names two things is listed once for each, and `duplicate-id` covers it.
	const named = [...diagram.nodes, ...diagram.groups].map(({ id }) => id);
	const duplicated = new Set(named.filter((id, index) => named.indexOf(id) !== index));
	/** Each member's first parent: a Group's id, or undefined for the Diagram itself. */
	const parents = new Map<string, string | undefined>();
	const lists: [parent: string | undefined, pointer: string, members: string[]][] = [
		[undefined, "/members", diagram.members],
		...diagram.groups.map((group, index): [string, string, string[]] => [
			group.id,
			`/groups/${index}/members`,
			group.members,
		]),
	];
	for (const [parent, pointer, members] of lists) {
		members.forEach((member, index) => {
			const thing = things.get(member);
			if (thing === undefined) {
				const owner = parentName(parent);
				diagnostics.push(
					error(
						"nesting",
						`${owner.charAt(0).toUpperCase()}${owner.slice(1)} has the member \`${member}\`, which isn't a Node or a Group on this Diagram.`,
						`${pointer}/${index}`,
					),
				);
			} else if (!parents.has(member)) {
				parents.set(member, parent);
			} else if (!duplicated.has(member)) {
				const first = parents.get(member);
				diagnostics.push(
					error(
						"nesting",
						first === parent
							? `${thing} \`${member}\` is listed twice among the members of ${parentName(parent)}. ${oneParent}`
							: `${thing} \`${member}\` is a member of both ${parentName(first)} and ${parentName(parent)}. ${oneParent}`,
						`${pointer}/${index}`,
					),
				);
			}
		});
	}
	const orphans = [
		...diagram.nodes.map(({ id }, index) => ["Node", id, `/nodes/${index}`] as const),
		...diagram.groups.map(({ id }, index) => ["Group", id, `/groups/${index}`] as const),
	].filter(([, id]) => !parents.has(id));
	for (const [thing, id, pointer] of orphans) {
		diagnostics.push(
			error(
				"nesting",
				`${thing} \`${id}\` isn't a member of the Diagram or of any Group. List it among the members of the Diagram, or of one Group.`,
				pointer,
			),
		);
	}
	return [...diagnostics, ...checkCycles(diagram, parents)];
}

/**
 * Groups that contain each other, so that none of them sits on the Diagram.
 * Climbing from each Group to its parent, and on, reaches the Diagram unless
 * it comes back round. Each cycle is reported once, at the first of its
 * Groups in model order, where that Group lists the next one.
 */
function checkCycles(diagram: AnyDiagram, parents: Map<string, string | undefined>): Diagnostic[] {
	const index = new Map(diagram.groups.map((group, at) => [group.id, at]));
	const seen = new Set<string>();
	const diagnostics: Diagnostic[] = [];
	for (const group of diagram.groups) {
		const path: string[] = [];
		let at: string | undefined = group.id;
		while (at !== undefined && !seen.has(at)) {
			seen.add(at);
			path.push(at);
			at = parents.get(at);
		}
		if (at === undefined || !path.includes(at)) {
			continue;
		}
		// The path climbs from member to parent; the cycle reads from parent to member.
		const cycle = path.slice(path.indexOf(at)).reverse();
		const first = Math.min(...cycle.map((id) => index.get(id) ?? 0));
		const start = cycle.findIndex((id) => index.get(id) === first);
		const ordered = [...cycle.slice(start), ...cycle.slice(0, start)];
		// The first Group lists the next one, or itself when it contains itself.
		const next = ordered[1 % ordered.length];
		const names = list(ordered.map((id) => `\`${id}\``));
		const members = diagram.groups[first]?.members ?? [];
		diagnostics.push(
			error(
				"nesting",
				`${
					cycle.length === 1
						? `Group ${names} contains itself`
						: `Groups ${names} contain each other${cycle.length > 2 ? " in a cycle" : ""}`
				}. Groups nest as a tree, rooted at the Diagram.`,
				`/groups/${first}/members/${members.indexOf(next ?? "")}`,
			),
		);
	}
	return diagnostics;
}

/**
 * Reads which Notation the input is written in: it must be a version-1
 * model, in one of the Notations. Every other rule depends on its Notation.
 */
function readNotation(
	input: unknown,
	notations: readonly Notation[],
): { diagnostics: Diagnostic[] } | { model: Record<string, unknown>; notation: Notation } {
	if (!isObject(input)) {
		return { diagnostics: [error("model-shape", "A Diagram must be a JSON object.", "")] };
	}
	if (input.version !== 1) {
		return {
			diagnostics: [
				error(
					"model-version",
					input.version === undefined
						? "The model has no `version`. This engine reads version 1 of the JSON model."
						: `This engine reads version 1 of the JSON model, not version ${JSON.stringify(input.version)}.`,
					"/version",
				),
			],
		};
	}
	const notation = notations.find(({ name }) => name === input.notation);
	if (notation === undefined) {
		return {
			diagnostics: [
				error(
					"unknown-notation",
					`The Diagram's Notation is \`${String(input.notation)}\`, which this engine doesn't have. ${owned(
						"Notation",
						"Notations",
						notations.map(({ name }) => name),
					)}`,
					"/notation",
				),
			],
		};
	}
	return { model: input, notation };
}

/** What checks one optional field's value, at its pointer. */
type FieldCheck = (value: unknown, at: string) => void;

/**
 * Checks that a version-1 model has every field of the right type, and no
 * field that the model doesn't have, or that its Notation's Diagrams don't,
 * so the rules after it can read it.
 */
function checkShape(input: Record<string, unknown>, notation: Notation): Diagnostic[] {
	// The authoring API's functions record each option they don't know, rather
	// than leave it behind, so that it's rejected as a field the model doesn't
	// have would be.
	const diagnostics: Diagnostic[] = [...unknownOptionsOf(input)];
	const check = (valid: boolean, pointer: string, what: string) => {
		if (!valid) {
			diagnostics.push(error("model-shape", `\`${pointer}\` must be ${what}.`, pointer));
		}
	};
	const checkList = (
		value: unknown,
		pointer: string,
		each: (item: unknown, at: string) => void,
	) => {
		if (Array.isArray(value)) {
			value.forEach((item, index) => {
				each(item, `${pointer}/${index}`);
			});
		} else {
			check(false, pointer, "a list");
		}
	};
	const checkStrings = (value: unknown, pointer: string, fields: string[]) => {
		if (isObject(value)) {
			for (const field of fields) {
				check(typeof value[field] === "string", `${pointer}/${field}`, "a string");
			}
		} else {
			check(false, pointer, "an object");
		}
	};
	/**
	 * Reports each field of `value` that `thing` doesn't have, listing those it
	 * does. `all` holds every field that the model has for it, of which its
	 * Notation's Diagrams may have only some. `alsoRead` holds fields that a
	 * later check reports in its own words.
	 */
	const checkFields = (
		value: Record<string, unknown>,
		pointer: string,
		thing: string,
		known: readonly string[],
		all: readonly string[] = known,
		alsoRead: readonly string[] = [],
	) => {
		for (const field of Object.keys(value)) {
			if (!known.includes(field) && !alsoRead.includes(field)) {
				const at = `${pointer}/${pointerSegment(field)}`;
				const listed = list(known.map((name) => `\`${name}\``));
				const where = all.includes(field) ? ` in the ${notation.name} Notation` : "";
				diagnostics.push(
					error(
						"model-shape",
						`\`${at}\` must be left out: ${thing} has no such field${where}. Its fields are ${listed}.`,
						at,
					),
				);
			}
		}
	};
	/** The fields that the Notation's Nodes, Groups or Edges may have, in the model's order. */
	const fieldsOfIts = (thing: "node" | "group" | "edge") =>
		fields[thing].filter((field) => hasField(notation, thing, field));
	/**
	 * Checks each optional field that `value` has and that its Notation's
	 * Diagrams may have, in the order of `checks`. One they may not have is
	 * already reported as a field to leave out.
	 */
	const checkOptional = <F extends string>(
		value: Record<string, unknown>,
		pointer: string,
		thing: "node" | "group" | "edge",
		checks: Record<F, FieldCheck>,
	) => {
		for (const [field, checkField] of Object.entries<FieldCheck>(checks)) {
			if (hasField(notation, thing, field) && value[field] !== undefined) {
				checkField(value[field], `${pointer}/${field}`);
			}
		}
	};
	const isText: FieldCheck = (value, at) => check(typeof value === "string", at, "a string");
	const isSomeText: FieldCheck = (value, at) =>
		check(
			typeof value === "string" && /[^ \t\n\r]/.test(value),
			at,
			"a string with some text in it",
		);

	checkFields(input, "", "a Diagram", fields.diagram);
	check(input.id === undefined || typeof input.id === "string", "/id", "a string");
	check(typeof input.title === "string", "/title", "a string");
	check(
		input.description === undefined || typeof input.description === "string",
		"/description",
		"a string",
	);
	check(directions.includes(input.direction), "/direction", "`right` or `down`");
	checkList(input.members, "/members", (member, at) => {
		check(typeof member === "string", at, "an id");
	});
	/**
	 * A Link has exactly one target, `id` or `doc`, and only a `doc` has a
	 * `section`. The model's third target, `term`, comes in slice 2.
	 */
	const checkLink = (link: unknown, at: string) => {
		if (!isObject(link)) {
			check(false, at, "an object");
			return;
		}
		// A Link to a glossary term is reported below, as a Link without a target.
		checkFields(link, at, "a Link", fields.link, fields.link, ["term"]);
		const targets = ["id", "doc", "term"].filter((field) => link[field] !== undefined);
		const [target] = targets;
		if (target === undefined || target === "term" || targets.length > 1) {
			diagnostics.push(
				error("model-shape", `\`${at}\` must have exactly one of \`id\` and \`doc\`.`, at),
			);
			return;
		}
		check(typeof link[target] === "string", `${at}/${target}`, "a string");
		check(link.label === undefined || typeof link.label === "string", `${at}/label`, "a string");
		if (link.section !== undefined && target === "id") {
			diagnostics.push(
				error(
					"model-shape",
					`\`${at}/section\` must be left out: only a Link to a document has sections.`,
					`${at}/section`,
				),
			);
		} else {
			check(
				link.section === undefined || typeof link.section === "string",
				`${at}/section`,
				"a string",
			);
		}
	};

	/** A Row has a name, and may have a value. */
	const checkRow = (row: unknown, at: string) => {
		if (isObject(row)) {
			checkFields(row, at, "a Row", fields.row);
		}
		checkStrings(row, at, ["name"]);
		if (isObject(row)) {
			check(row.value === undefined || typeof row.value === "string", `${at}/value`, "a string");
		}
	};
	/** An Edge end is a Node's id, or an object that names a Node and one of its Rows. */
	const checkEnd = (end: unknown, at: string) => {
		if (isObject(end)) {
			checkFields(end, at, "an Edge end at a Row", fields.rowEnd);
			checkStrings(end, at, ["node", "row"]);
		} else {
			check(typeof end === "string", at, "a Node's id, or an object with `node` and `row`");
		}
	};

	const nodeChecks: Record<NodeField, FieldCheck> = {
		technology: isText,
		external: (value, at) => check(typeof value === "boolean", at, "`true` or `false`"),
		status: isText,
		description: isText,
		callout: isSomeText,
		rows: (rows, at) => checkList(rows, at, checkRow),
		links: (links, at) => checkList(links, at, checkLink),
	};
	checkList(input.nodes, "/nodes", (node, at) => {
		if (isObject(node)) {
			checkFields(node, at, "a Node", fieldsOfIts("node"), fields.node);
		}
		checkStrings(node, at, ["id", "kind", "title"]);
		if (isObject(node)) {
			checkOptional(node, at, "node", nodeChecks);
		}
	});
	const groupChecks: Record<GroupField, FieldCheck> = {
		description: isText,
		links: (links, at) => checkList(links, at, checkLink),
	};
	checkList(input.groups, "/groups", (group, at) => {
		if (isObject(group)) {
			checkFields(group, at, "a Group", fieldsOfIts("group"), fields.group);
		}
		checkStrings(group, at, ["id", "kind", "title"]);
		if (isObject(group)) {
			// Its members come between its description and its Links, as they always have.
			const { description, links } = groupChecks;
			checkOptional(group, at, "group", { description });
			checkList(group.members, `${at}/members`, (member, memberAt) => {
				check(typeof member === "string", memberAt, "an id");
			});
			checkOptional(group, at, "group", { links });
		}
	});
	/** An Edge's roles hold a list of roles for each end that carries any, by the end's name. */
	const checkRoles: FieldCheck = (roles, at) => {
		if (!isObject(roles)) {
			check(false, at, "an object");
			return;
		}
		checkFields(roles, at, "an Edge's `roles`", fields.roles);
		for (const end of fields.roles) {
			if (roles[end] !== undefined) {
				checkList(roles[end], `${at}/${end}`, isText);
			}
		}
	};
	const edgeChecks: Record<EdgeField, FieldCheck> = {
		label: isSomeText,
		technology: isText,
		rate: isText,
		roles: checkRoles,
	};
	checkList(input.edges, "/edges", (edge, at) => {
		if (isObject(edge)) {
			checkFields(edge, at, "an Edge", fieldsOfIts("edge"), fields.edge);
		}
		checkStrings(edge, at, ["id", "kind"]);
		if (isObject(edge)) {
			checkEnd(edge.from, `${at}/from`);
			checkEnd(edge.to, `${at}/to`);
			checkOptional(edge, at, "edge", edgeChecks);
		}
	});
	// Walkthroughs come in slice 4. Until then, one would be dropped unseen.
	if (Array.isArray(input.walkthroughs)) {
		check(
			input.walkthroughs.length === 0,
			"/walkthroughs",
			"an empty list: this engine doesn't play Walkthroughs yet",
		);
	} else {
		check(false, "/walkthroughs", "a list");
	}
	return diagnostics;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function error(rule: string, message: string, pointer: string): Diagnostic {
	return { severity: "error", rule, message, pointer };
}
