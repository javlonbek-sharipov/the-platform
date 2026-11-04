/**
 * A minimal layout: each Node goes in the rank of the longest path that
 * reaches it, ranks run left to right, and each rank stacks its Nodes from the
 * top in declaration order. Ticket 02 replaces it with the full layout.
 */

import type { Diagram } from "../authoring/model.ts";
import type { SceneNode } from "./scene.ts";

const nodeWidth = 160;
const nodeHeight = 48;
const rankGap = 96;
const nodeGap = 32;
export const margin = 24;

export function layOut(diagram: Diagram): SceneNode[] {
	const ranks = ranksOf(diagram);
	const nextInRank: number[] = [];
	return diagram.nodes.map((node) => {
		const rank = ranks.get(node.id) ?? 0;
		const order = nextInRank[rank] ?? 0;
		nextInRank[rank] = order + 1;
		const x = margin + rank * (nodeWidth + rankGap);
		const y = margin + order * (nodeHeight + nodeGap);
		const middle = y + nodeHeight / 2;
		return {
			id: node.id,
			kind: node.kind,
			box: { x, y, width: nodeWidth, height: nodeHeight },
			input: { side: "left", point: { x, y: middle } },
			output: { side: "right", point: { x: x + nodeWidth, y: middle } },
			title: { text: node.title, point: { x: x + nodeWidth / 2, y: middle } },
		};
	});
}

/**
 * The length of the longest path that reaches each Node. A depth-first search
 * from the Nodes in declaration order leaves out every Edge that leads back
 * into its current path, so that the rest have no cycles. Self-loops never
 * count.
 */
function ranksOf(diagram: Diagram): Map<string, number> {
	const targets = new Map<string, string[]>(diagram.nodes.map((node) => [node.id, []]));
	for (const edge of diagram.edges) {
		if (edge.from !== edge.to) {
			targets.get(edge.from)?.push(edge.to);
		}
	}

	const onPath = new Set<string>();
	const visited = new Set<string>();
	const finished: string[] = [];
	const kept = new Map<string, string[]>();
	const visit = (id: string) => {
		visited.add(id);
		onPath.add(id);
		const next: string[] = [];
		for (const target of targets.get(id) ?? []) {
			if (onPath.has(target)) {
				continue;
			}
			next.push(target);
			if (!visited.has(target)) {
				visit(target);
			}
		}
		kept.set(id, next);
		onPath.delete(id);
		finished.push(id);
	};
	for (const node of diagram.nodes) {
		if (!visited.has(node.id)) {
			visit(node.id);
		}
	}

	// Reverse finishing order is a topological order of the Edges kept.
	const ranks = new Map<string, number>(diagram.nodes.map((node) => [node.id, 0]));
	for (const id of finished.reverse()) {
		const rank = ranks.get(id) ?? 0;
		for (const target of kept.get(id) ?? []) {
			ranks.set(target, Math.max(ranks.get(target) ?? 0, rank + 1));
		}
	}
	return ranks;
}
