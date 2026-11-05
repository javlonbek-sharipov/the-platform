/**
 * The domain Notation: the one definition of everything about domain
 * Diagrams that depends on Kinds. Validation, layout, the SVG writer, the
 * description, the JSON Schema, the model's types and the builder all read
 * it, so nothing outside this file names a domain Kind or role.
 *
 * So far, a domain Diagram is a context map: its Nodes are bounded contexts,
 * and its Edges show how those contexts relate.
 */

import type { EdgeKindOf, NodeKindOf, Notation, RoleOf } from "./notation.ts";

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
	// A context may be one we don't own, such as a payment provider's. What an
	// architecture Node shows of how it's built and how it's doing, a context
	// doesn't have.
	fields: { node: ["external", "description", "links"], group: [], edge: ["label", "roles"] },
	hues: {
		context: { light: "#4f55c8", dark: "#8f96f5" },
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
	},
	statuses: {},
	// The description names what the drawing shows only as a dashed outline.
	facts: ["kind", "external"],
	groupKinds: {},
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
	},
	bundling: "none",
	flow: false,
} as const satisfies Notation;

type Definition = typeof definition;

/** The type of the domain Notation's definition, by a name that messages can show. */
export interface DomainNotation extends Definition {}

export const domainNotation: DomainNotation = definition;

export type DomainNodeKind = NodeKindOf<DomainNotation>;
export type DomainEdgeKind = EdgeKindOf<DomainNotation>;
export type DomainRole = RoleOf<DomainNotation>;
