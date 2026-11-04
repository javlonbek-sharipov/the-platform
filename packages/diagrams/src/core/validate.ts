/**
 * Validation is the authority on what a valid Diagram is, not the types:
 * generated JSON has no types, so everything they prevent is checked here.
 */

import type { Diagram, Link } from "../authoring/model.ts";
import {
	architectureEdgeKinds,
	architectureGroupKinds,
	architectureNodeKinds,
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

const kebabCase = "[a-z0-9]+(?:-[a-z0-9]+)*";
/** Lowercase kebab-case words, optionally namespaced by a context, as in `billing/order`. */
const id = `${kebabCase}(?:/${kebabCase})*`;
const idPattern = new RegExp(`^${id}$`);
/** An id, or an Edge's default name: its two ends' ids joined by `->`. */
const edgeIdPattern = new RegExp(`^${id}(?:->${id})?$`);

const directions: unknown[] = [undefined, "right", "down"];

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
		for (const [end, verb] of [
			["from", "starts"],
			["to", "ends"],
		] as const) {
			const at = edge[end];
			if (!nodeIds.has(at)) {
				diagnostics.push(
					error(
						"edge-end",
						groupIds.has(at)
							? `Edge \`${edge.id}\` ${verb} at \`${at}\`, which is a Group. An Edge starts and ends at Nodes, never at Groups.`
							: `Edge \`${edge.id}\` ${verb} at \`${at}\`, which isn't a Node on this Diagram.`,
						`/edges/${index}/${end}`,
					),
				);
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
	});

	diagnostics.push(...checkNesting(diagram));

	return diagnostics.some((diagnostic) => diagnostic.severity === "error")
		? { diagnostics }
		: { diagnostics, diagram };
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
	/** Each member's first parent, named as messages name it. */
	const parents = new Map<string, string>();
	const lists: [parent: string, pointer: string, members: string[]][] = [
		["the Diagram", "/members", diagram.members],
		...diagram.groups.map((group, index): [string, string, string[]] => [
			`Group \`${group.id}\``,
			`/groups/${index}/members`,
			group.members,
		]),
	];
	for (const [parent, pointer, members] of lists) {
		members.forEach((member, index) => {
			const thing = things.get(member);
			const first = parents.get(member);
			if (thing === undefined) {
				const owner = parent === "the Diagram" ? "The Diagram" : parent;
				diagnostics.push(
					error(
						"nesting",
						`${owner} has the member \`${member}\`, which isn't a Node or a Group on this Diagram.`,
						`${pointer}/${index}`,
					),
				);
				return;
			}
			if (first === undefined || duplicated.has(member)) {
				parents.set(member, first ?? parent);
				return;
			}
			diagnostics.push(
				error(
					"nesting",
					first === parent
						? `${thing} \`${member}\` is listed twice among the members of ${parent}. ${oneParent}`
						: `${thing} \`${member}\` is a member of both ${first} and ${parent}. ${oneParent}`,
					`${pointer}/${index}`,
				),
			);
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
	return [...diagnostics, ...checkCycles(diagram)];
}

/**
 * Groups that contain each other, so that none of them sits on the Diagram.
 * Each cycle is reported once, at the first of its Groups in model order,
 * where that Group lists the next one.
 */
function checkCycles(diagram: Diagram): Diagnostic[] {
	const groupIds = new Set(diagram.groups.map((group) => group.id));
	/** The Group that lists each Group first, as long as it is a Group. */
	const parentGroup = new Map<string, string>();
	for (const group of diagram.groups) {
		for (const member of group.members) {
			if (groupIds.has(member) && !parentGroup.has(member) && !diagram.members.includes(member)) {
				parentGroup.set(member, group.id);
			}
		}
	}
	const index = new Map(diagram.groups.map((group, at) => [group.id, at]));
	const reported = new Set<string>();
	const diagnostics: Diagnostic[] = [];
	for (const group of diagram.groups) {
		const path: string[] = [];
		let at: string | undefined = group.id;
		while (at !== undefined && !path.includes(at) && !reported.has(at)) {
			path.push(at);
			at = parentGroup.get(at);
		}
		if (at === undefined || reported.has(at)) {
			continue;
		}
		// The path climbs from member to parent; the cycle reads from parent to member.
		const cycle = path.slice(path.indexOf(at)).reverse();
		const first = Math.min(...cycle.map((id) => index.get(id) ?? 0));
		const start = cycle.findIndex((id) => index.get(id) === first);
		const ordered = [...cycle.slice(start), ...cycle.slice(0, start)];
		for (const id of path) {
			reported.add(id);
		}
		const [head = "", next = head] = ordered;
		const members = diagram.groups[first]?.members ?? [];
		const names = list(ordered.map((id) => `\`${id}\``));
		diagnostics.push(
			error(
				"nesting",
				`${
					ordered.length === 1
						? `Group ${names} contains itself`
						: `Groups ${names} contain each other${ordered.length > 2 ? " in a cycle" : ""}`
				}. Groups nest as a tree, rooted at the Diagram.`,
				`/groups/${first}/members/${members.indexOf(next)}`,
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

	checkList(input.nodes, "/nodes", (node, at) => {
		checkStrings(node, at, ["id", "kind", "title"]);
		if (isObject(node) && node.links !== undefined) {
			checkList(node.links, `${at}/links`, checkLink);
		}
	});
	checkList(input.groups, "/groups", (group, at) => {
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
		checkStrings(edge, at, ["id", "kind", "from", "to"]);
	});
	checkList(input.walkthroughs, "/walkthroughs", () => {});
	return diagnostics;
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
