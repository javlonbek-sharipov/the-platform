/** The Kinds of the architecture Notation, and how each Node Kind looks. */

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
}

export const architectureNodeLooks: Record<ArchitectureNodeKind, ArchitectureNodeLook> = {
	person: { width: 160, height: 80 },
	system: { width: 208, height: 64 },
	client: { width: 176, height: 48 },
	gateway: { width: 176, height: 48 },
	service: { width: 176, height: 48 },
	worker: { width: 176, height: 48 },
	function: { width: 176, height: 48 },
	database: { width: 176, height: 48 },
	cache: { width: 176, height: 48 },
	queue: { width: 192, height: 48 },
	storage: { width: 176, height: 48 },
	search: { width: 176, height: 48 },
};
