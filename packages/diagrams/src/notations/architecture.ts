/**
 * The Kinds of the architecture Notation, how each Node Kind looks, and the
 * Technologies that have a logo.
 */

import type { ColorName } from "../core/theme.ts";
import type { NodeKindOf, Notation } from "./notation.ts";
import { technologies } from "./technologies.ts";

/** The slug of a Technology that has a logo, which editors offer for `technology`. */
export type KnownTechnology = keyof typeof technologies;

/**
 * A Technology's slug, such as `postgres` or `grpc`. Editors offer the slugs
 * that have a logo, but any slug works: one without a logo is drawn as its
 * name. Intersecting `string` with `{}` keeps the union from widening into
 * plain `string`, which would leave editors nothing to offer.
 */
export type Technology = KnownTechnology | (string & {});

/** Every logo in the logo table is drawn in a square this many units wide. */
export const logoUnits = 24;

const knownTechnologies: ReadonlyMap<string, { name: string; path: string }> = new Map(
	Object.entries(technologies),
);

/**
 * A Technology as it's drawn: with its display name and its logo's path
 * data, when the logo table has it, or else by its slug alone.
 */
export function technologyOf(slug: string): { name: string; logo?: string } {
	const known = knownTechnologies.get(slug);
	return known === undefined ? { name: slug } : { name: known.name, logo: known.path };
}

export const architectureEdgeKinds = ["call", "message"] as const;

export type ArchitectureEdgeKind = (typeof architectureEdgeKinds)[number];

/** How an Edge of one Kind looks, and how a sentence names it. A Kind alone decides both. */
export interface ArchitectureEdgeLook {
	/** Its line: solid for a call, which waits for its answer, and dashed for a message, which doesn't. */
	line: "solid" | "dashed";
	/**
	 * The sentence that names an Edge of this Kind, for screen readers and the
	 * SVG's description. `{from}` and `{to}` stand for its two ends.
	 */
	sentence: string;
}

export const architectureEdgeLooks: Record<ArchitectureEdgeKind, ArchitectureEdgeLook> = {
	call: { line: "solid", sentence: "{from} calls {to}" },
	message: { line: "dashed", sentence: "{from} sends messages to {to}" },
};

export const architectureGroupKinds = ["system", "region", "zone"] as const;

export type ArchitectureGroupKind = (typeof architectureGroupKinds)[number];

/** How a Group of one Kind draws its box. A Kind alone decides it. */
export interface ArchitectureGroupLook {
	/** How wide its box's stroke is, in px: a `system` heavier than a `region`. */
	stroke: number;
	/** Its box's line: solid, or dashed for a `zone`. */
	line: "solid" | "dashed";
}

export const architectureGroupLooks: Record<ArchitectureGroupKind, ArchitectureGroupLook> = {
	system: { stroke: 2, line: "solid" },
	region: { stroke: 1.5, line: "solid" },
	zone: { stroke: 1.5, line: "dashed" },
};

/** How a Node is doing. Each status shows as a mark with a shape and a color of its own. */
export const architectureStatuses = ["ok", "degraded", "down", "unknown"] as const;

export type ArchitectureStatus = (typeof architectureStatuses)[number];

/**
 * How a status shows: a mark of its own shape and its own color, at the end
 * of its Node's header, so that color is never the only signal.
 */
export interface ArchitectureStatusLook {
	/** The mark, as path data in a box 12 px square. */
	mark: string;
	/** Whether the mark is stroked as lines, rather than filled. */
	line: boolean;
	/** The theme's color for it. */
	color: ColorName;
}

export const architectureStatusLooks: Record<ArchitectureStatus, ArchitectureStatusLook> = {
	// A dot.
	ok: { mark: "M 1 6 A 5 5 0 1 0 11 6 A 5 5 0 1 0 1 6 Z", line: false, color: "ok" },
	// A warning triangle.
	degraded: { mark: "M 6 1.5 L 11 10.5 H 1 Z", line: false, color: "warn" },
	// A cross.
	down: { mark: "M 2.5 2.5 L 9.5 9.5 M 9.5 2.5 L 2.5 9.5", line: true, color: "danger" },
	// A square.
	unknown: { mark: "M 1.75 1.75 H 10.25 V 10.25 H 1.75 Z", line: false, color: "muted" },
};

/**
 * The architecture Notation's definition: everything about architecture
 * Diagrams that depends on Kinds, which the rest of the engine reads from here.
 */
export const architectureNotation = {
	name: "architecture",
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
} as const satisfies Notation;

export type ArchitectureNodeKind = NodeKindOf<typeof architectureNotation>;
