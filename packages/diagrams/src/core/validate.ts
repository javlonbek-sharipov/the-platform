/**
 * Validation is the authority on what a valid Diagram is, not the types:
 * generated JSON has no types, so everything they prevent is checked here.
 */

import { type Diagram, endNode } from "../authoring/model.ts";
import {
	architectureEdgeKinds,
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
const edgeKinds: readonly string[] = architectureEdgeKinds;
const statuses: readonly string[] = architectureStatuses;

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
		if (node.status !== undefined && !statuses.includes(node.status)) {
			diagnostics.push(
				error(
					"unknown-status",
					`Node \`${node.id}\` has the status \`${node.status}\`, which the architecture Notation doesn't have. Its statuses are ${list(statuses)}.`,
					`/nodes/${index}/status`,
				),
			);
		}
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
		node.links?.forEach((link, linkIndex) => {
			if (link.id !== undefined && !idPattern.test(link.id)) {
				diagnostics.push(
					error(
						"id-format",
						`Node \`${node.id}\` has a Link to \`${link.id}\`, which isn't a lowercase kebab-case id. Write ids like \`payments-api\`.`,
						`/nodes/${index}/links/${linkIndex}/id`,
					),
				);
			}
		});
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
						`Edge \`${edge.id}\` ${verb} at \`${node}\`, which isn't a Node on this Diagram.`,
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
	});

	return diagnostics.some((diagnostic) => diagnostic.severity === "error")
		? { diagnostics }
		: { diagnostics, diagram };
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

	/** A Row has a name, and may have a value. */
	const checkRow = (row: unknown, at: string) => {
		checkStrings(row, at, ["name"]);
		if (isObject(row)) {
			check(row.value === undefined || typeof row.value === "string", `${at}/value`, "a string");
		}
	};
	/** An Edge end is a Node's id, or an object that names a Node and one of its Rows. */
	const checkEnd = (end: unknown, at: string) => {
		if (isObject(end)) {
			checkStrings(end, at, ["node", "row"]);
		} else {
			check(typeof end === "string", at, "a Node's id, or an object with `node` and `row`");
		}
	};

	checkList(input.nodes, "/nodes", (node, at) => {
		checkStrings(node, at, ["id", "kind", "title"]);
		if (isObject(node)) {
			const { external, status, callout } = node;
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
	checkList(input.groups, "/groups", () => {});
	checkList(input.edges, "/edges", (edge, at) => {
		checkStrings(edge, at, ["id", "kind"]);
		if (isObject(edge)) {
			checkEnd(edge.from, `${at}/from`);
			checkEnd(edge.to, `${at}/to`);
		}
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
