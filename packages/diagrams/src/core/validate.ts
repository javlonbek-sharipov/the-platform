/**
 * Validation is the authority on what a valid Diagram is, not the types:
 * generated JSON has no types, so everything they prevent is checked here.
 */

import {
	type Diagram,
	type Edge,
	endNode,
	type Group,
	type Link,
	type Node,
	type Row,
	type RowEnd,
} from "../authoring/model.ts";
import {
	architectureEdgeKinds,
	architectureGroupKinds,
	architectureNodeKinds,
	architectureStatuses,
} from "../notations/architecture.ts";
import type { Diagnostic } from "./diagnostics.ts";

export interface Validation {
	diagnostics: Diagnostic[];
	/** The Diagram, when it has no errors. */
	diagram?: Diagram;
}

const nodeKinds: readonly string[] = architectureNodeKinds;
const groupKinds: readonly string[] = architectureGroupKinds;
const edgeKinds: readonly string[] = architectureEdgeKinds;
const statuses: readonly string[] = architectureStatuses;

const kebabCase = "[a-z0-9]+(?:-[a-z0-9]+)*";
/** Lowercase kebab-case words, optionally namespaced by a context, as in `billing/order`. */
const id = `${kebabCase}(?:/${kebabCase})*`;
const idPattern = new RegExp(`^${id}$`);
/** An id, or an Edge's default name: its two ends' ids joined by `->`. */
const edgeIdPattern = new RegExp(`^${id}(?:->${id})?$`);
/** A Technology's slug: lowercase words joined by hyphens, as in `postgres` or `aws-lambda`. */
const slugPattern = new RegExp(`^${kebabCase}$`);
/** A number, an optional `k` or `M`, a slash, and `s`, `min` or `h`, as in `2k/s` or `30/min`. */
const ratePattern = /^[0-9]+(?:\.[0-9]+)?[kM]?\/(?:s|min|h)$/;

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
 * types make it one, so that a misspelled field is never silently ignored.
 */
const fields = {
	diagram: fieldsOf<Diagram>({
		version: true,
		notation: true,
		id: true,
		title: true,
		direction: true,
		members: true,
		nodes: true,
		groups: true,
		edges: true,
		walkthroughs: true,
	}),
	node: fieldsOf<Node>({
		id: true,
		kind: true,
		title: true,
		technology: true,
		external: true,
		status: true,
		rows: true,
		links: true,
		callout: true,
	}),
	row: fieldsOf<Row>({ name: true, value: true }),
	group: fieldsOf<Group>({
		id: true,
		kind: true,
		title: true,
		members: true,
		description: true,
		links: true,
	}),
	edge: fieldsOf<Edge>({
		id: true,
		kind: true,
		from: true,
		to: true,
		label: true,
		technology: true,
		rate: true,
	}),
	rowEnd: fieldsOf<RowEnd>({ node: true, row: true }),
	link: fieldsOf<Link>({ id: true, doc: true, section: true, label: true }),
};

export function validate(input: unknown): Validation {
	const shape = checkShape(input);
	if (shape.length > 0) {
		return { diagnostics: shape };
	}
	const diagram = input as Diagram;
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
					`Node \`${node.id}\` has the Kind \`${node.kind}\`, which the architecture Notation doesn't have. Its Node Kinds are ${list(nodeKinds)}.`,
					`/nodes/${index}/kind`,
				),
			);
		}
		if (node.status !== undefined && !statuses.includes(node.status)) {
			diagnostics.push(
				error(
					"unknown-status",
					`Node \`${node.id}\` has the status \`${node.status}\`, which the architecture Notation doesn't have. Its statuses are ${list(statuses)}.`,
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
					`Group \`${group.id}\` has the Kind \`${group.kind}\`, which the architecture Notation doesn't have. Its Group Kinds are ${list(groupKinds)}.`,
					`/groups/${index}/kind`,
				),
			);
		}
	});

	// An Edge end names a Row by its name, among its Node's Rows.
	const rowsOf = new Map(diagram.nodes.map((node) => [node.id, node.rows ?? []]));
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
			if (!nodeIds.has(node)) {
				diagnostics.push(
					error(
						"edge-end",
						groupIds.has(node)
							? `Edge \`${edge.id}\` ${verb} at \`${node}\`, which is a Group. An Edge starts and ends at Nodes, never at Groups.`
							: `Edge \`${edge.id}\` ${verb} at \`${node}\`, which isn't a Node on this Diagram.`,
						typeof end === "string" ? at : `${at}/node`,
					),
				);
			} else if (typeof end !== "string") {
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
					`Edge \`${edge.id}\` has the Kind \`${edge.kind}\`, which the architecture Notation doesn't have. Its Edge Kinds are ${list(edgeKinds)}.`,
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
	});

	diagnostics.push(...checkDefaultEdgeIds(diagram), ...checkNesting(diagram));

	return diagnostics.some((diagnostic) => diagnostic.severity === "error")
		? { diagnostics }
		: { diagnostics, diagram };
}

/**
 * The authoring API names an Edge without an id after its two Nodes, so two
 * Edges that join the same two Nodes would get the same name, whatever Rows
 * they attach to. Both must then be given ids. An Edge whose id is that name
 * keeps the default, and is an error when another Edge would get it too.
 * Two Edges that both keep it are already a `duplicate-id` error.
 */
function checkDefaultEdgeIds(diagram: Diagram): Diagnostic[] {
	const nameOf = (edge: Diagram["edges"][number]) => `${endNode(edge.from)}->${endNode(edge.to)}`;
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
function checkNesting(diagram: Diagram): Diagnostic[] {
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
function checkCycles(diagram: Diagram, parents: Map<string, string | undefined>): Diagnostic[] {
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
 * Checks that the input is a version-1 model of the architecture Notation,
 * with every field of the right type, so the rules after it can read it.
 */
function checkShape(input: unknown): Diagnostic[] {
	if (!isObject(input)) {
		return [error("model-shape", "A Diagram must be a JSON object.", "")];
	}
	if (input.version !== 1) {
		return [
			error(
				"model-version",
				input.version === undefined
					? "The model has no `version`. This engine reads version 1 of the JSON model."
					: `This engine reads version 1 of the JSON model, not version ${JSON.stringify(input.version)}.`,
				"/version",
			),
		];
	}
	if (input.notation !== "architecture") {
		return [
			error(
				"unknown-notation",
				`The Diagram's Notation is \`${String(input.notation)}\`, which this engine doesn't have. Its Notations are architecture.`,
				"/notation",
			),
		];
	}

	const diagnostics: Diagnostic[] = [];
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
	 * does. `alsoRead` holds fields that a later check reports in its own words.
	 */
	const checkFields = (
		value: Record<string, unknown>,
		pointer: string,
		thing: string,
		known: readonly string[],
		alsoRead: readonly string[] = [],
	) => {
		for (const field of Object.keys(value)) {
			if (!known.includes(field) && !alsoRead.includes(field)) {
				const at = `${pointer}/${pointerSegment(field)}`;
				const listed = list(known.map((name) => `\`${name}\``));
				diagnostics.push(
					error(
						"model-shape",
						`\`${at}\` must be left out: ${thing} has no such field. Its fields are ${listed}.`,
						at,
					),
				);
			}
		}
	};

	checkFields(input, "", "a Diagram", fields.diagram);
	check(input.id === undefined || typeof input.id === "string", "/id", "a string");
	check(typeof input.title === "string", "/title", "a string");
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
		checkFields(link, at, "a Link", fields.link, ["term"]);
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

	checkList(input.nodes, "/nodes", (node, at) => {
		if (isObject(node)) {
			checkFields(node, at, "a Node", fields.node);
		}
		checkStrings(node, at, ["id", "kind", "title"]);
		if (isObject(node)) {
			const { technology, external, status, callout } = node;
			check(
				technology === undefined || typeof technology === "string",
				`${at}/technology`,
				"a string",
			);
			check(
				external === undefined || typeof external === "boolean",
				`${at}/external`,
				"`true` or `false`",
			);
			check(status === undefined || typeof status === "string", `${at}/status`, "a string");
			check(
				callout === undefined || (typeof callout === "string" && /[^ \t\n\r]/.test(callout)),
				`${at}/callout`,
				"a string with some text in it",
			);
		}
		if (isObject(node) && node.rows !== undefined) {
			checkList(node.rows, `${at}/rows`, checkRow);
		}
		if (isObject(node) && node.links !== undefined) {
			checkList(node.links, `${at}/links`, checkLink);
		}
	});
	checkList(input.groups, "/groups", (group, at) => {
		if (isObject(group)) {
			checkFields(group, at, "a Group", fields.group);
		}
		checkStrings(group, at, ["id", "kind", "title"]);
		if (isObject(group)) {
			check(
				group.description === undefined || typeof group.description === "string",
				`${at}/description`,
				"a string",
			);
			checkList(group.members, `${at}/members`, (member, memberAt) => {
				check(typeof member === "string", memberAt, "an id");
			});
			if (group.links !== undefined) {
				checkList(group.links, `${at}/links`, checkLink);
			}
		}
	});
	checkList(input.edges, "/edges", (edge, at) => {
		if (isObject(edge)) {
			checkFields(edge, at, "an Edge", fields.edge);
		}
		checkStrings(edge, at, ["id", "kind"]);
		if (isObject(edge)) {
			const { label, technology, rate } = edge;
			checkEnd(edge.from, `${at}/from`);
			checkEnd(edge.to, `${at}/to`);
			check(
				label === undefined || (typeof label === "string" && /[^ \t\n\r]/.test(label)),
				`${at}/label`,
				"a string with some text in it",
			);
			check(
				technology === undefined || typeof technology === "string",
				`${at}/technology`,
				"a string",
			);
			check(rate === undefined || typeof rate === "string", `${at}/rate`, "a string");
		}
	});
	checkList(input.walkthroughs, "/walkthroughs", () => {});
	return diagnostics;
}

/** A field's name as one segment of a JSON Pointer, escaped as RFC 6901 says. */
function pointerSegment(field: string): string {
	return field.replaceAll("~", "~0").replaceAll("/", "~1");
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function error(rule: string, message: string, pointer: string): Diagnostic {
	return { severity: "error", rule, message, pointer };
}

/** `a, b and c` */
function list(words: readonly string[]): string {
	return words.length < 2
		? words.join("")
		: `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
