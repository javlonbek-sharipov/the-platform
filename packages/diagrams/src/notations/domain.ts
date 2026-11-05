/**
 * The domain Notation: the one definition of everything about domain
 * Diagrams that depends on Kinds. Validation, layout, the SVG writer, the
 * description, the JSON Schema, the model's types and the builder all read
 * it, so nothing outside this file names a domain Kind or role.
 *
 * A domain Diagram is a context map, or one context's aggregate diagram.
 */

import { type AnyDiagram, endNode } from "../authoring/model.ts";
import type { Diagnostic } from "../core/diagnostics.ts";
import type { EdgeKindOf, GroupKindOf, NodeKindOf, Notation, RoleOf } from "./notation.ts";

/**
 * What each end of an Edge that runs from an upstream context to a
 * downstream one may carry. The upstream context may offer an open host
 * service, a published language, or both. The downstream one conforms to the
 * upstream's model or keeps it out with an anticorruption layer, never both.
 */
const upstreamAndDownstream = {
	from: { anyOf: ["OHS", "PL"] },
	to: { oneOf: ["CF", "ACL"] },
} as const;

const definition = {
	name: "domain",
	// Rows list an aggregate's contents. Technology and runtime state belong
	// to architecture Diagrams; External, descriptions and Links serve both.
	fields: {
		node: ["external", "rows", "description", "links"],
		group: ["description", "links"],
		edge: ["label", "roles"],
	},
	hues: {
		context: { light: "#4f55c8", dark: "#8f96f5" },
		aggregate: { light: "#27694c", dark: "#70cda0" },
		event: { light: "#935619", dark: "#e8ae68" },
	},
	nodeKinds: {
		// A bounded context is drawn as context maps draw one: as an oval, bigger
		// than anything an architecture Diagram draws inside a system.
		context: {
			width: 192,
			height: 64,
			outline: "oval",
			// A speech bubble: a context is where one language is spoken.
			badge:
				"M 4 2 H 12 A 2.5 2.5 0 0 1 14.5 4.5 V 9 A 2.5 2.5 0 0 1 12 11.5 H 8 L 4.5 14.5 V 11.5 H 4 A 2.5 2.5 0 0 1 1.5 9 V 4.5 A 2.5 2.5 0 0 1 4 2 Z",
			hue: "context",
		},
		aggregate: {
			width: 256,
			height: 64,
			outline: "heavy",
			badge:
				"M 6 1 H 10 V 5 H 6 Z M 8 5 V 9 M 3 9 H 13 M 3 9 V 11 M 13 9 V 11 M 1 11 H 5 V 15 H 1 Z M 11 11 H 15 V 15 H 11 Z",
			hue: "aggregate",
		},
		event: {
			width: 224,
			height: 48,
			outline: "chamfer",
			badge: "M 9 1 L 3 9 H 7 L 6 15 L 13 6 H 9 Z",
			hue: "event",
		},
	},
	statuses: {},
	// The description names what the drawing shows only as a dashed outline.
	facts: ["kind", "external"],
	groupKinds: { context: { stroke: 2, line: "solid", namespace: true } },
	// How a context integrates with the one at the Edge's other end.
	roles: {
		OHS: { name: "open host service" },
		PL: { name: "published language" },
		CF: { name: "conformist" },
		ACL: { name: "anticorruption layer" },
	},
	edgeKinds: {
		// Two contexts that are partners, or that share a kernel, relate both ways
		// alike. The other two Kinds run from the upstream context to the
		// downstream one. In each pair the second Kind is dashed, so that each of
		// the four looks different. Each joins two contexts.
		partnership: {
			line: "solid",
			sentence: "{from} and {to} are partners",
			symmetric: true,
			from: ["context"],
			to: ["context"],
		},
		"shared-kernel": {
			line: "dashed",
			sentence: "{from} and {to} share a kernel",
			symmetric: true,
			from: ["context"],
			to: ["context"],
		},
		"upstream-downstream": {
			line: "solid",
			sentence: "{from} is upstream of {to}",
			from: ["context"],
			to: ["context"],
			roles: upstreamAndDownstream,
		},
		"customer-supplier": {
			line: "dashed",
			sentence: "{from} supplies {to}",
			from: ["context"],
			to: ["context"],
			roles: upstreamAndDownstream,
		},
		references: {
			line: "dashed",
			sentence: "{from} references {to}",
			from: ["aggregate"],
			to: ["aggregate"],
		},
		emits: {
			line: "solid",
			sentence: "{from} emits {to}",
			from: ["aggregate"],
			to: ["event"],
		},
		reacts: {
			line: "dotted",
			sentence: "{from} triggers {to}",
			from: ["event"],
			to: ["aggregate"],
		},
	},
	bundling: "none",
	validation: {
		rules: {
			"domain-form":
				"A domain Diagram is a context map with no Groups, or one context Group's aggregates and events, with only other contexts' events outside it. The forms never mix.",
		},
		check: checkForm,
	},
} as const satisfies Notation;

/** The two domain forms: a context map, or one context's aggregate diagram. */
function checkForm(diagram: AnyDiagram): Diagnostic[] {
	const error = (message: string, pointer: string): Diagnostic => ({
		severity: "error",
		rule: "domain-form",
		message,
		pointer,
	});
	const contexts = [
		...diagram.nodes.map((node, at) => ({ ...node, pointer: `/nodes/${at}/id` })),
		...diagram.groups.map((group, at) => ({ ...group, pointer: `/groups/${at}/id` })),
	].filter(({ kind, id }) => kind === "context" && id.includes("/"));
	if (contexts.length > 0) {
		return contexts.map(({ id, pointer }) => ({
			severity: "error",
			rule: "namespace",
			pointer,
			message: `Context \`${id}\` has a namespaced id. A context's id is one lowercase kebab-case name, such as \`billing\`; only its members have full ids like \`billing/invoice\`.`,
		}));
	}
	if (diagram.groups.length === 0 && diagram.nodes.every((node) => node.kind === "context")) {
		return [];
	}
	const mixed = diagram.nodes.flatMap((node, index) =>
		node.kind === "context"
			? [
					error(
						`Node \`${node.id}\` is a context on an aggregate diagram. A domain Diagram is a context map or an aggregate diagram, never both. Draw this context on a separate context map.`,
						`/nodes/${index}/kind`,
					),
				]
			: [],
	);
	if (mixed.length > 0) {
		return mixed;
	}
	const [context] = diagram.groups;
	if (
		context === undefined ||
		diagram.groups.length !== 1 ||
		!diagram.members.includes(context.id)
	) {
		return [
			error(
				"An aggregate diagram draws exactly one bounded context, as a top-level Group of Kind `context`. Draw each context on its own aggregate diagram.",
				"/groups",
			),
		];
	}
	const outside = diagram.nodes.flatMap((node, index) => {
		if (context.members.includes(node.id)) {
			return [];
		}
		const [owner, local, extra] = node.id.split("/");
		return node.kind === "event" &&
			owner !== context.id &&
			local !== undefined &&
			extra === undefined
			? []
			: [
					error(
						`Node \`${node.id}\` is outside Group \`${context.id}\`. Only an event from another context, under its full id, may sit outside. Declare this context's aggregates and events with the Group's builder.`,
						`/nodes/${index}`,
					),
				];
	});
	return [
		...outside,
		...diagram.edges.flatMap((edge, index) =>
			edge.kind === "emits" && !context.members.includes(endNode(edge.to))
				? [
						error(
							`Edge \`${edge.id}\` emits another context's event, \`${endNode(edge.to)}\`. An aggregate emits events inside its own context Group; another context's event may react into this context instead.`,
							`/edges/${index}/to${typeof edge.to === "string" ? "" : "/node"}`,
						),
					]
				: [],
		),
	];
}

type Definition = typeof definition;

/** The type of the domain Notation's definition, by a name that messages can show. */
export interface DomainNotation extends Definition {}

export const domainNotation: DomainNotation = definition;

export type DomainNodeKind = NodeKindOf<DomainNotation>;
export type DomainGroupKind = GroupKindOf<DomainNotation>;
export type DomainEdgeKind = EdgeKindOf<DomainNotation>;
export type DomainRole = RoleOf<DomainNotation>;
