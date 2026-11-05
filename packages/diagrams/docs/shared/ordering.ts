import type { DomainNode } from "@the-platform/diagrams";

/** The same context on its context map and around its aggregate diagram. */
export const ordering = {
	id: "ordering",
	kind: "context",
	title: "Ordering",
} as const satisfies DomainNode;

/** Drawn inside Ordering and borrowed by contexts that react to it. */
export const orderPlaced = {
	id: "ordering/order-placed",
	kind: "event",
	title: "Order placed",
} as const satisfies DomainNode;
