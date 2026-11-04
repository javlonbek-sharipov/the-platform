/**
 * A minimal router: each Edge runs from its source's output Port to its
 * target's input Port. Ticket 03 replaces it with orthogonal routing.
 */

import type { Diagram } from "../authoring/model.ts";
import type { SceneEdge, SceneNode } from "./scene.ts";

export function route(diagram: Diagram, nodes: SceneNode[]): SceneEdge[] {
	const byId = new Map(nodes.map((node) => [node.id, node]));
	return diagram.edges.map((edge) => {
		const from = byId.get(edge.from);
		const to = byId.get(edge.to);
		if (from === undefined || to === undefined) {
			throw new Error(`Edge ${edge.id} ends at a Node that validation should have rejected`);
		}
		return {
			id: edge.id,
			kind: edge.kind,
			from: edge.from,
			to: edge.to,
			route: [from.output.point, to.input.point],
		};
	});
}
