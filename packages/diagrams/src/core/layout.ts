/**
 * A minimal layout: ranks run left to right, and each rank stacks its Nodes
 * from the top. Ticket 02 replaces it with the full layout.
 */

import type { Diagram } from "../authoring/model.ts";
import type { SceneNode } from "./scene.ts";

const nodeWidth = 160;
const nodeHeight = 48;
const rankGap = 96;
const nodeGap = 32;
export const margin = 24;

export function layOut(diagram: Diagram): SceneNode[] {
	const nextInRank: number[] = [];
	return diagram.nodes.map((node) => {
		const rank = 0;
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
