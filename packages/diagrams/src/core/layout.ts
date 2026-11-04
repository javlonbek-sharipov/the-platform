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
import type { Point, SceneNode } from "./scene.ts";

const nodeWidth = 160;
const nodeHeight = 48;
const rankGap = 96;
export const clearance = 32;
/** Node sizes are multiples of twice the grid, so that their corners land on it too. */
export const grid = 8;
export const margin = 24;

export function layOut(diagram: Diagram): SceneNode[] {
	const down = diagram.direction === "down";
	/** From the layout's frame, where the rank axis is x, to the scene. */
	const turn = (along: number, across: number): Point =>
		down ? { x: margin + across, y: margin + along } : { x: margin + along, y: margin + across };

	// Header Ports sit on a Node's sides along the rank axis, halfway across it.
	const members: Member[] = diagram.nodes.map(() => {
		const [depth, breadth] = down ? [nodeHeight, nodeWidth] : [nodeWidth, nodeHeight];
		return { depth, before: breadth / 2, after: breadth / 2 };
	});
	const index = new Map(diagram.nodes.map((node, at) => [node.id, at]));
	const connections = diagram.edges.map((edge) => ({
		from: index.get(edge.from) ?? 0,
		to: index.get(edge.to) ?? 0,
	}));
	const placements = arrange(members, connections, { clearance, rankGap, grid });

	return diagram.nodes.map((node, at) => {
		const { x: line, y: ports } = placements[at] ?? { x: 0, y: 0 };
		const { depth, before } = members[at] ?? { depth: 0, before: 0 };
		const corner = turn(line - depth / 2, ports - before);
		const box = { ...corner, width: nodeWidth, height: nodeHeight };
		return {
			id: node.id,
			kind: node.kind,
			box,
			input: { side: down ? "top" : "left", point: turn(line - depth / 2, ports) },
			output: { side: down ? "bottom" : "right", point: turn(line + depth / 2, ports) },
			title: {
				text: node.title,
				point: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
			},
		};
	});
}
