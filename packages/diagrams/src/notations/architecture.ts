/**
 * The architecture Notation: the one definition of everything about
 * architecture Diagrams that depends on Kinds. Validation, layout, the SVG
 * writer, the description, the JSON Schema, the model's types and the builder
 * all read it, so nothing outside this file names an architecture Kind.
 */

import type { EdgeKindOf, GroupKindOf, NodeKindOf, Notation, StatusOf } from "./notation.ts";

const definition = {
	name: "architecture",
	fields: {
		node: ["technology", "external", "status", "rows", "description", "links", "callout"],
		group: ["description", "links"],
		edge: ["label", "technology", "rate"],
	},
	// The Kinds of one family share a hue: the people who use the system and
	// the apps they use it with; systems; the things that run code; the things
	// that keep data; and queues.
	hues: {
		users: { light: "#8250df", dark: "#ab7df8" },
		system: { light: "#424a53", dark: "#b7bdc8" },
		compute: { light: "#0969da", dark: "#4493f8" },
		data: { light: "#1b7c83", dark: "#39c5cf" },
		messaging: { light: "#bc4c00", dark: "#f0883e" },
	},
	nodeKinds: {
		person: {
			width: 160,
			height: 80,
			outline: "figure",
			// A head and shoulders.
			badge: "M 5 4.5 A 3 3 0 1 0 11 4.5 A 3 3 0 1 0 5 4.5 Z M 2.5 14.5 A 5.5 5.5 0 0 1 13.5 14.5",
			hue: "users",
		},
		system: {
			width: 208,
			height: 64,
			outline: "heavy",
			// Four parts of one whole.
			badge: "M 2 2 H 7 V 7 H 2 Z M 9 2 H 14 V 7 H 9 Z M 2 9 H 7 V 14 H 2 Z M 9 9 H 14 V 14 H 9 Z",
			hue: "system",
		},
		client: {
			width: 176,
			height: 48,
			outline: "window",
			// A screen on a stand.
			badge: "M 1.5 2.5 H 14.5 V 11 H 1.5 Z M 5 14.5 H 11 M 8 11 V 14.5",
			hue: "users",
		},
		gateway: {
			width: 176,
			height: 48,
			outline: "hexagon",
			// An arrow through an arch.
			badge:
				"M 1.5 14.5 H 14.5 M 3.5 14.5 V 7 A 4.5 4.5 0 0 1 12.5 7 V 14.5 M 5.5 10.5 H 10.5 M 8.5 8.5 L 10.5 10.5 L 8.5 12.5",
			hue: "compute",
		},
		service: {
			width: 176,
			height: 48,
			outline: "rounded",
			// A cube.
			badge:
				"M 8 1.5 L 14 4.75 V 11.25 L 8 14.5 L 2 11.25 V 4.75 Z M 2 4.75 L 8 8 L 14 4.75 M 8 8 V 14.5",
			hue: "compute",
		},
		worker: {
			width: 176,
			height: 48,
			outline: "stack",
			// A gear.
			badge:
				"M 12.68 6.24 L 14.86 6.61 L 14.86 9.39 L 12.68 9.76 L 12.55 10.06 L 13.83 11.87 L 11.87 13.83 L 10.06 12.55 L 9.76 12.68 L 9.39 14.86 L 6.61 14.86 L 6.24 12.68 L 5.94 12.55 L 4.13 13.83 L 2.17 11.87 L 3.45 10.06 L 3.32 9.76 L 1.14 9.39 L 1.14 6.61 L 3.32 6.24 L 3.45 5.94 L 2.17 4.13 L 4.13 2.17 L 5.94 3.45 L 6.24 3.32 L 6.61 1.14 L 9.39 1.14 L 9.76 3.32 L 10.06 3.45 L 11.87 2.17 L 13.83 4.13 L 12.55 5.94 Z M 6 8 A 2 2 0 1 0 10 8 A 2 2 0 1 0 6 8 Z",
			hue: "compute",
		},
		function: {
			width: 176,
			height: 48,
			outline: "chamfer",
			// A lambda.
			badge: "M 3.5 2 H 6.5 L 13 14 M 8.5 6.5 L 3.5 14",
			hue: "compute",
		},
		database: {
			width: 176,
			height: 48,
			outline: "cylinder",
			// A stack of disks.
			badge:
				"M 2.5 4 A 5.5 2 0 0 0 13.5 4 A 5.5 2 0 0 0 2.5 4 V 12 A 5.5 2 0 0 0 13.5 12 V 4 M 2.5 8 A 5.5 2 0 0 0 13.5 8",
			hue: "data",
		},
		cache: {
			width: 176,
			height: 48,
			outline: "chip",
			// A bolt of lightning.
			badge: "M 9.5 1.5 L 3.5 9 H 8 L 6.5 14.5 L 12.5 7 H 8 Z",
			hue: "data",
		},
		queue: {
			width: 192,
			height: 48,
			outline: "pipe",
			// Messages waiting in line.
			badge: "M 1.5 3.5 H 14.5 M 1.5 12.5 H 14.5 M 4.5 6.5 V 9.5 M 8 6.5 V 9.5 M 11.5 6.5 V 9.5",
			hue: "messaging",
		},
		storage: {
			width: 176,
			height: 48,
			outline: "page",
			// A bucket.
			badge: "M 2 4 A 6 2 0 0 0 14 4 A 6 2 0 0 0 2 4 L 3.5 13 A 4.5 1.5 0 0 0 12.5 13 L 14 4",
			hue: "data",
		},
		search: {
			width: 176,
			height: 48,
			outline: "pill",
			// A magnifying glass.
			badge:
				"M 2 6.75 A 4.75 4.75 0 1 0 11.5 6.75 A 4.75 4.75 0 1 0 2 6.75 Z M 10.25 10.25 L 14.5 14.5",
			hue: "data",
		},
	},
	statuses: {
		// A dot.
		ok: { mark: "M 1 6 A 5 5 0 1 0 11 6 A 5 5 0 1 0 1 6 Z", line: false, color: "ok" },
		// A warning triangle.
		degraded: { mark: "M 6 1.5 L 11 10.5 H 1 Z", line: false, color: "warn" },
		// A cross.
		down: { mark: "M 2.5 2.5 L 9.5 9.5 M 9.5 2.5 L 2.5 9.5", line: true, color: "danger" },
		// A square.
		unknown: { mark: "M 1.75 1.75 H 10.25 V 10.25 H 1.75 Z", line: false, color: "muted" },
	},
	// The description names what the drawing shows only as a logo, a dashed
	// outline or a mark.
	facts: ["kind", "technology", "external", "status"],
	groupKinds: {
		// A `system` is heavier than a `region`, and a `zone` is dashed. A call
		// between two regions, or two zones, costs latency and egress, so it
		// stands out: between regions first.
		system: { stroke: 2, line: "solid" },
		region: { stroke: 1.5, line: "solid", crossing: "across regions" },
		zone: { stroke: 1.5, line: "dashed", crossing: "across zones" },
	},
	// Neither end of a call or a message plays a part that a tag would name.
	roles: {},
	edgeKinds: {
		// Solid for a call, which waits for its answer, and dashed for a message, which doesn't.
		call: { line: "solid", sentence: "{from} calls {to}" },
		message: { line: "dashed", sentence: "{from} sends messages to {to}" },
	},
	// The Edges of one Kind into one Port merge into a trunk, so that a busy
	// Node doesn't sprout a tangle of lines.
	bundling: "target",
	flow: true,
} as const satisfies Notation;

type Definition = typeof definition;

/** The type of the architecture Notation's definition, by a name that messages can show. */
export interface ArchitectureNotation extends Definition {}

export const architectureNotation: ArchitectureNotation = definition;

export type ArchitectureNodeKind = NodeKindOf<ArchitectureNotation>;
export type ArchitectureStatus = StatusOf<ArchitectureNotation>;
export type ArchitectureGroupKind = GroupKindOf<ArchitectureNotation>;
export type ArchitectureEdgeKind = EdgeKindOf<ArchitectureNotation>;
