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
import { frameOf, partsOf } from "./nodes.ts";
import type { Point, SceneNode } from "./scene.ts";

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

	// Header Ports sit on a Node's sides along the rank axis: for `right`, level
	// with its header, and for `down`, halfway across it.
	const frames = diagram.nodes.map(frameOf);
	const members: Member[] = frames.map(({ width, height, headerTop, headerHeight }) => {
		if (down) {
			return { depth: height, before: width / 2, after: width / 2 };
		}
		const middle = headerTop + headerHeight / 2;
		return { depth: width, before: middle, after: height - middle };
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
		const { width, height } = frames[at] ?? { width: 0, height: 0 };
		const box = { ...corner, width, height };
		const { header, badge, title } = partsOf(node, box);
		return {
			id: node.id,
			kind: node.kind,
			box,
			header,
			input: { side: down ? "top" : "left", point: turn(line - depth / 2, ports) },
			output: { side: down ? "bottom" : "right", point: turn(line + depth / 2, ports) },
			badge,
			title,
		};
	});
}
