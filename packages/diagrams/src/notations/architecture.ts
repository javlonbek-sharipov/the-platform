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

/** How a Node of one Kind looks. A Kind alone decides it. */
export interface ArchitectureNodeLook {
	/** The Node's size, in px, which its title never changes. Both are multiples of 16, twice the grid. */
	width: number;
	height: number;
	/** The shape drawn inside the Node's rectangle. */
	outline: Outline;
}

export const architectureNodeLooks: Record<ArchitectureNodeKind, ArchitectureNodeLook> = {
	person: { width: 160, height: 80, outline: "figure" },
	system: { width: 208, height: 64, outline: "heavy" },
	client: { width: 176, height: 48, outline: "window" },
	gateway: { width: 176, height: 48, outline: "hexagon" },
	service: { width: 176, height: 48, outline: "rounded" },
	worker: { width: 176, height: 48, outline: "stack" },
	function: { width: 176, height: 48, outline: "chamfer" },
	database: { width: 176, height: 48, outline: "cylinder" },
	cache: { width: 176, height: 48, outline: "chip" },
	queue: { width: 192, height: 48, outline: "pipe" },
	storage: { width: 176, height: 48, outline: "page" },
	search: { width: 176, height: 48, outline: "pill" },
};
