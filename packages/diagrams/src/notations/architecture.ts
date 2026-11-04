/** The Kinds of the architecture Notation. */

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

export const architectureGroupKinds = ["system", "region", "zone"] as const;

export type ArchitectureGroupKind = (typeof architectureGroupKinds)[number];
