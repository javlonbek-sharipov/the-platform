/**
 * Layout: a pure function of the Diagram, with no coordinates in the source,
 * no randomness and no memory of earlier layouts. Authors steer it only with
 * the Diagram's direction and the order they declare things in, which breaks
 * every tie.
 *
 * The rank axis runs along the direction: x for `right`, y for `down`. The
 * order axis runs across it.
 */

import type { Diagram } from "../authoring/model.ts";
import { arrange, type Member } from "./layers.ts";
import type { Box, SceneNode } from "./scene.ts";

const nodeWidth = 160;
const nodeHeight = 48;
const rankGap = 96;
export const clearance = 32;
/** Node sizes are multiples of twice the grid, so that their corners land on it too. */
export const grid = 8;
export const margin = 24;

export function layOut(diagram: Diagram): SceneNode[] {
	const down = diagram.direction === "down";
	const index = new Map(diagram.nodes.map((node, at) => [node.id, at]));
	const members: Member[] = diagram.nodes.map(() =>
		down
			? { depth: nodeHeight, before: nodeWidth / 2, after: nodeWidth / 2 }
			: { depth: nodeWidth, before: nodeHeight / 2, after: nodeHeight / 2 },
	);
	const connections = diagram.edges.map((edge) => ({
		from: index.get(edge.from) ?? 0,
		to: index.get(edge.to) ?? 0,
	}));
	const placements = arrange(members, connections, { clearance, rankGap, grid });

	return diagram.nodes.map((node, at) => {
		const { x: line, y: ports } = placements[at] ?? { x: 0, y: 0 };
		const box: Box = down
			? {
					x: margin + ports - nodeWidth / 2,
					y: margin + line - nodeHeight / 2,
					width: nodeWidth,
					height: nodeHeight,
				}
			: {
					x: margin + line - nodeWidth / 2,
					y: margin + ports - nodeHeight / 2,
					width: nodeWidth,
					height: nodeHeight,
				};
		const { x, y } = box;
		const center = x + nodeWidth / 2;
		const middle = y + nodeHeight / 2;
		return {
			id: node.id,
			kind: node.kind,
			box,
			input: down
				? { side: "top", point: { x: center, y } }
				: { side: "left", point: { x, y: middle } },
			output: down
				? { side: "bottom", point: { x: center, y: y + nodeHeight } }
				: { side: "right", point: { x: x + nodeWidth, y: middle } },
			title: { text: node.title, point: { x: center, y: middle } },
		};
	});
}
