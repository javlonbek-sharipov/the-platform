/**
 * Validation is the authority on what a valid Diagram is, not the types:
 * generated JSON has no types, so everything they prevent is checked here.
 */

import type { Diagram } from "../authoring/model.ts";
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
		if (!nodeIds.has(edge.from)) {
			diagnostics.push(
				error(
					"edge-end",
					`Edge \`${edge.id}\` starts at \`${edge.from}\`, which isn't a Node on this Diagram.`,
					`/edges/${index}/from`,
				),
			);
		}
		if (!nodeIds.has(edge.to)) {
			diagnostics.push(
				error(
					"edge-end",
					`Edge \`${edge.id}\` ends at \`${edge.to}\`, which isn't a Node on this Diagram.`,
					`/edges/${index}/to`,
				),
			);
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
	});
	checkList(input.groups, "/groups", () => {});
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
