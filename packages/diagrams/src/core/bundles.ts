/**
 * Bundles (spec: Edge routing, step 4): which Edges share a trunk, and so a
 * lane, along the stretch where their routes run together. Layout leaves
 * room for a lane for each bundle that crosses a gap between ranks, and the
 * router merges each bundle into one trunk.
 */

import type { Diagram, RowEnd } from "../authoring/model.ts";

/**
 * Which Edges share a trunk (spec: Edge routing, step 4): those of one Kind
 * that go into one Port, those of one Kind that leave one Port, or none.
 * Parallel Edges never share one.
 */
export type Bundling = "target" | "source" | "none";

/** The architecture Notation bundles Edges into one Port, and so does `render` unless told otherwise. */
export const defaultBundling: Bundling = "target";

/**
 * Lanes keep the preferred spacing where there's room, squeeze down to the
 * minimum in a narrow corridor, and keep the padding from the corridor's
 * sides. The narrowest corridor, a clearance wide, holds four lanes. Layout
 * leaves room for lanes at the preferred spacing, and the router spreads them.
 */
export const lanes = { spacing: 8, minimum: 4, padding: 8 };

/**
 * Each Edge's lane group: the Edges that may share a lane, which is a bundle
 * (spec: Edge routing, step 4). A bundle is the Edges of one Kind that go into
 * one Port, or that leave one Port, or each Edge on its own. Parallel Edges,
 * which join the same pair of Ports, never share one: the second Edge between
 * two Ports in a bundle goes into a second group, and so on.
 *
 * An Edge in `ownLanes` keeps a lane of its own too, as a parallel Edge does:
 * a labeled Edge that its bundle's trunk would leave no run of its own that
 * holds its label (step 8).
 */
export function laneGroups(
	diagram: Diagram,
	bundle: Bundling,
	ownLanes: ReadonlySet<string> = new Set(),
): Map<string, string> {
	const groups = new Map<string, string>();
	const taken = new Map<string, number>();
	const port = (end: string | RowEnd) => (typeof end === "string" ? [end] : [end.node, end.row]);
	for (const edge of [...diagram.edges].sort((a, b) => compareText(a.id, b.id))) {
		const [shared, other] =
			bundle === "source" ? [port(edge.from), port(edge.to)] : [port(edge.to), port(edge.from)];
		const key = bundle === "none" ? edge.id : JSON.stringify([edge.kind, ...shared]);
		if (ownLanes.has(edge.id)) {
			groups.set(edge.id, JSON.stringify([key, edge.id]));
			continue;
		}
		const pair = JSON.stringify([key, ...other]);
		const index = taken.get(pair) ?? 0;
		taken.set(pair, index + 1);
		groups.set(edge.id, JSON.stringify([key, index]));
	}
	return groups;
}

/** Orders text by UTF-16 code units, as ids are compared everywhere in the core. */
export function compareText(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
