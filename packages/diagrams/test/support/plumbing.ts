/**
 * A Notation that only the tests define: a house's plumbing. It shares no
 * Kind, status or hue with the engine's own Notations, so whatever the engine
 * does with one of its Diagrams, it read from this definition.
 */

import type { Notation } from "../../src/index.ts";

export const plumbingNotation = {
	name: "plumbing",
	// Plumbing has no Technologies, callouts, Links or rates.
	fields: {
		node: ["external", "status", "rows", "description"],
		group: ["description"],
		edge: ["label"],
	},
	hues: {
		water: { light: "#0b6e99", dark: "#5cc8f0" },
		metal: { light: "#6b5b3e", dark: "#d9c08a" },
	},
	nodeKinds: {
		// A drum.
		tank: {
			width: 160,
			height: 64,
			outline: "cylinder",
			badge: "M 3 3 H 13 V 13 H 3 Z",
			hue: "water",
		},
		// An impeller.
		pump: {
			width: 128,
			height: 48,
			outline: "chamfer",
			badge: "M 8 2 L 14 14 H 2 Z",
			hue: "metal",
		},
		// A spout.
		tap: { width: 144, height: 48, outline: "pill", badge: "M 2 8 H 14 M 8 2 V 14", hue: "metal" },
	},
	statuses: {
		// A drop, and a bar across the pipe.
		open: { mark: "M 6 1 L 10 7 A 4 4 0 1 1 2 7 Z", line: false, color: "ok" },
		shut: { mark: "M 2 6 H 10", line: true, color: "danger" },
	},
	// Whether its valve is open comes first, and whose it is goes unsaid.
	facts: ["status", "kind"],
	groupKinds: {
		room: { stroke: 1, line: "dashed" },
		// Water that changes floors needs pressure, so an Edge between two floors stands out.
		floor: { stroke: 2.5, line: "solid", crossing: "between floors" },
	},
	edgeKinds: {
		// A pipe runs from a tank or a pump to a pump or a tap, and a drain joins any two Nodes.
		pipe: {
			line: "solid",
			sentence: "{from} feeds {to}",
			from: ["tank", "pump"],
			to: ["pump", "tap"],
		},
		drain: { line: "dashed", sentence: "{from} drains into {to}" },
		// A coupling joins two tanks, and runs neither way.
		coupling: {
			line: "solid",
			sentence: "{from} is coupled with {to}",
			symmetric: true,
			from: ["tank"],
			to: ["tank"],
		},
	},
	// The pipes out of one Port share a trunk until they part.
	bundling: "source",
} as const satisfies Notation;

/** A plumbing Diagram's model, as a tool would write it, with nothing on it unless given. */
export function plumbingModel(parts: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		version: 1,
		notation: "plumbing",
		title: "House",
		direction: "right",
		members: [],
		nodes: [],
		groups: [],
		edges: [],
		walkthroughs: [],
		...parts,
	};
}
