/**
 * A Notation that only the tests define: a house's plumbing. It shares no
 * Kind, status or hue with the engine's own Notations, so whatever the engine
 * does with one of its Diagrams, it read from this definition.
 */

import type { Notation } from "../../src/index.ts";

export const plumbingNotation = {
	name: "plumbing",
	hues: {
		water: { light: "#0b6e99", dark: "#5cc8f0" },
		metal: { light: "#6b5b3e", dark: "#d9c08a" },
	},
	nodeKinds: {
		// A drum.
		tank: {
			width: 144,
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
		tap: { width: 112, height: 48, outline: "pill", badge: "M 2 8 H 14 M 8 2 V 14", hue: "metal" },
	},
	groupKinds: {
		room: { stroke: 1, line: "dashed" },
		floor: { stroke: 2.5, line: "solid" },
	},
	edgeKinds: {
		pipe: { line: "solid", sentence: "{from} feeds {to}" },
		drain: { line: "dashed", sentence: "{from} drains into {to}" },
		coupling: { line: "solid", sentence: "{from} is coupled with {to}" },
	},
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
