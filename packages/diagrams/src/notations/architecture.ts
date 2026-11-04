/** The Kinds of the architecture Notation, and how each Node Kind looks. */

import type { Outline } from "../core/outlines.ts";

export const architectureNodeKinds = [
	"person",
	"system",
	"client",
	"gateway",
	"service",
	"worker",
	"function",
	"database",
	"cache",
	"queue",
	"storage",
	"search",
] as const;

export type ArchitectureNodeKind = (typeof architectureNodeKinds)[number];

export const architectureEdgeKinds = ["call", "message"] as const;

export type ArchitectureEdgeKind = (typeof architectureEdgeKinds)[number];

/**
 * The families of Node Kinds. The Kinds of one family share a hue: the people
 * who use the system and the apps they use it with; systems; the things that
 * run code; the things that keep data; and queues.
 */
export const architectureFamilies = ["users", "system", "compute", "data", "messaging"] as const;

export type ArchitectureFamily = (typeof architectureFamilies)[number];

/** How a Node of one Kind looks. A Kind alone decides it. */
export interface ArchitectureNodeLook {
	/** The Node's size, in px, which its title never changes. Both are multiples of 16, twice the grid. */
	width: number;
	height: number;
	/** The shape drawn inside the Node's rectangle. */
	outline: Outline;
	/** The badge at the start of the header: path data for a glyph 16 px square, stroked. */
	badge: string;
	/** The family whose hue the Node takes. */
	family: ArchitectureFamily;
}

export const architectureNodeLooks: Record<ArchitectureNodeKind, ArchitectureNodeLook> = {
	person: {
		width: 160,
		height: 80,
		outline: "figure",
		// A head and shoulders.
		badge: "M 5 4.5 A 3 3 0 1 0 11 4.5 A 3 3 0 1 0 5 4.5 Z M 2.5 14.5 A 5.5 5.5 0 0 1 13.5 14.5",
		family: "users",
	},
	system: {
		width: 208,
		height: 64,
		outline: "heavy",
		// Four parts of one whole.
		badge: "M 2 2 H 7 V 7 H 2 Z M 9 2 H 14 V 7 H 9 Z M 2 9 H 7 V 14 H 2 Z M 9 9 H 14 V 14 H 9 Z",
		family: "system",
	},
	client: {
		width: 176,
		height: 48,
		outline: "window",
		// A screen on a stand.
		badge: "M 1.5 2.5 H 14.5 V 11 H 1.5 Z M 5 14.5 H 11 M 8 11 V 14.5",
		family: "users",
	},
	gateway: {
		width: 176,
		height: 48,
		outline: "hexagon",
		// An arrow through an arch.
		badge:
			"M 1.5 14.5 H 14.5 M 3.5 14.5 V 7 A 4.5 4.5 0 0 1 12.5 7 V 14.5 M 5.5 10.5 H 10.5 M 8.5 8.5 L 10.5 10.5 L 8.5 12.5",
		family: "compute",
	},
	service: {
		width: 176,
		height: 48,
		outline: "rounded",
		// A cube.
		badge:
			"M 8 1.5 L 14 4.75 V 11.25 L 8 14.5 L 2 11.25 V 4.75 Z M 2 4.75 L 8 8 L 14 4.75 M 8 8 V 14.5",
		family: "compute",
	},
	worker: {
		width: 176,
		height: 48,
		outline: "stack",
		// A gear.
		badge:
			"M 12.68 6.24 L 14.86 6.61 L 14.86 9.39 L 12.68 9.76 L 12.55 10.06 L 13.83 11.87 L 11.87 13.83 L 10.06 12.55 L 9.76 12.68 L 9.39 14.86 L 6.61 14.86 L 6.24 12.68 L 5.94 12.55 L 4.13 13.83 L 2.17 11.87 L 3.45 10.06 L 3.32 9.76 L 1.14 9.39 L 1.14 6.61 L 3.32 6.24 L 3.45 5.94 L 2.17 4.13 L 4.13 2.17 L 5.94 3.45 L 6.24 3.32 L 6.61 1.14 L 9.39 1.14 L 9.76 3.32 L 10.06 3.45 L 11.87 2.17 L 13.83 4.13 L 12.55 5.94 Z M 6 8 A 2 2 0 1 0 10 8 A 2 2 0 1 0 6 8 Z",
		family: "compute",
	},
	function: {
		width: 176,
		height: 48,
		outline: "chamfer",
		// A lambda.
		badge: "M 3.5 2 H 6.5 L 13 14 M 8.5 6.5 L 3.5 14",
		family: "compute",
	},
	database: {
		width: 176,
		height: 48,
		outline: "cylinder",
		// A stack of disks.
		badge:
			"M 2.5 4 A 5.5 2 0 0 0 13.5 4 A 5.5 2 0 0 0 2.5 4 V 12 A 5.5 2 0 0 0 13.5 12 V 4 M 2.5 8 A 5.5 2 0 0 0 13.5 8",
		family: "data",
	},
	cache: {
		width: 176,
		height: 48,
		outline: "chip",
		// A bolt of lightning.
		badge: "M 9.5 1.5 L 3.5 9 H 8 L 6.5 14.5 L 12.5 7 H 8 Z",
		family: "data",
	},
	queue: {
		width: 192,
		height: 48,
		outline: "pipe",
		// Messages waiting in line.
		badge: "M 1.5 3.5 H 14.5 M 1.5 12.5 H 14.5 M 4.5 6.5 V 9.5 M 8 6.5 V 9.5 M 11.5 6.5 V 9.5",
		family: "messaging",
	},
	storage: {
		width: 176,
		height: 48,
		outline: "page",
		// A bucket.
		badge: "M 2 4 A 6 2 0 0 0 14 4 A 6 2 0 0 0 2 4 L 3.5 13 A 4.5 1.5 0 0 0 12.5 13 L 14 4",
		family: "data",
	},
	search: {
		width: 176,
		height: 48,
		outline: "pill",
		// A magnifying glass.
		badge:
			"M 2 6.75 A 4.75 4.75 0 1 0 11.5 6.75 A 4.75 4.75 0 1 0 2 6.75 Z M 10.25 10.25 L 14.5 14.5",
		family: "data",
	},
};
