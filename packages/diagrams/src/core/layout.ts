/**
 * A minimal layout: each Node goes in the rank of the longest path that
 * reaches it, ranks run left to right, and each rank stacks its Nodes from the
 * top in declaration order. Ticket 02 replaces it with the full layout.
 */

import type { Diagram, Direction } from "../authoring/model.ts";
import type { Box, Point, SceneNode, ScenePort, Side } from "./scene.ts";

/**
 * The margin every Node keeps around it, which no other Node may enter. It
 * leaves a corridor for Edges between any two Nodes, and the router relies
 * on it.
 */
export const clearance = 32;

/**
 * A Port's stub is half a clearance long, so it ends on the routing grid's
 * line beside its side.
 */
const stubLength = clearance / 2;

const nodeWidth = 160;
const nodeHeight = 48;
const rankGap = 96;
const nodeGap = clearance;
export const margin = 24;

export function layOut(diagram: Diagram): SceneNode[] {
	const ranks = ranksOf(diagram);
	const nextInRank: number[] = [];
	return diagram.nodes.map((node) => {
		const rank = ranks.get(node.id) ?? 0;
		const order = nextInRank[rank] ?? 0;
		nextInRank[rank] = order + 1;
		const box = {
			x: margin + rank * (nodeWidth + rankGap),
			y: margin + order * (nodeHeight + nodeGap),
			width: nodeWidth,
			height: nodeHeight,
		};
		return {
			id: node.id,
			kind: node.kind,
			box,
			...headerPorts(box, diagram.direction),
			title: {
				text: node.title,
				point: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
			},
		};
	});
}

/**
 * Each Node's input and output Port, level with its header: on its left and
 * right sides for `right`, and in the middle of its top and bottom for `down`.
 * Until Nodes have Rows, the header is the whole Node.
 */
function headerPorts(box: Box, direction: Direction): { input: ScenePort; output: ScenePort } {
	if (direction === "down") {
		const middle = box.x + box.width / 2;
		return {
			input: port("top", { x: middle, y: box.y }),
			output: port("bottom", { x: middle, y: box.y + box.height }),
		};
	}
	const level = box.y + box.height / 2;
	return {
		input: port("left", { x: box.x, y: level }),
		output: port("right", { x: box.x + box.width, y: level }),
	};
}

const outward: Record<Side, Point> = {
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
	top: { x: 0, y: -1 },
	bottom: { x: 0, y: 1 },
};

function port(side: Side, point: Point): ScenePort {
	const normal = outward[side];
	return {
		side,
		point,
		stub: { x: point.x + normal.x * stubLength, y: point.y + normal.y * stubLength },
	};
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
