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
import type { Point, SceneNode, ScenePort, Side } from "./scene.ts";
import { nodeTitle, rowTexts } from "./text.ts";

const nodeWidth = 160;
/** The band at the top of every Node, which holds its title. */
const headerHeight = 48;
/**
 * The band of each Row, below the header. It's two steps of 16 px, so that
 * every Node's size stays a multiple of 16 px.
 */
const rowHeight = 32;
const rankGap = 96;
export const clearance = 32;
/** Node sizes are multiples of twice the grid, so that their corners land on it too. */
export const grid = 8;
export const margin = 24;

/**
 * A Port's stub is half a clearance long, so it ends on the routing grid's
 * line beside its side.
 */
const stubLength = clearance / 2;

export function layOut(diagram: Diagram): SceneNode[] {
	const down = diagram.direction === "down";
	/** From the layout's frame, where the rank axis is x, to the scene. */
	const turn = (along: number, across: number): Point =>
		down ? { x: margin + across, y: margin + along } : { x: margin + along, y: margin + across };

	// A Node is as tall as its header and its Rows' bands together. Its header
	// Ports sit on its sides along the rank axis: level with its header for
	// `right`, and halfway across it for `down`.
	const heights = diagram.nodes.map((node) => headerHeight + (node.rows?.length ?? 0) * rowHeight);
	const members: Member[] = heights.map((height) =>
		down
			? { depth: height, before: nodeWidth / 2, after: nodeWidth / 2 }
			: { depth: nodeWidth, before: headerHeight / 2, after: height - headerHeight / 2 },
	);
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
		const box = { ...corner, width: nodeWidth, height: heights[at] ?? headerHeight };
		return {
			id: node.id,
			kind: node.kind,
			box,
			input: port(down ? "top" : "left", turn(line - depth / 2, ports)),
			output: port(down ? "bottom" : "right", turn(line + depth / 2, ports)),
			title: nodeTitle(node.title, { ...corner, width: nodeWidth, height: headerHeight }),
			rows: (node.rows ?? []).map((row, index) => {
				const band = {
					x: box.x,
					y: box.y + headerHeight + index * rowHeight,
					width: nodeWidth,
					height: rowHeight,
				};
				return { box: band, ...rowTexts(row, band) };
			}),
		};
	});
}

const outward: Record<Side, Point> = {
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
	top: { x: 0, y: -1 },
	bottom: { x: 0, y: 1 },
};

/** A Port on a Node's side, with its stub: a short, straight run out of the side. */
function port(side: Side, point: Point): ScenePort {
	const normal = outward[side];
	return {
		side,
		point,
		stub: { x: point.x + normal.x * stubLength, y: point.y + normal.y * stubLength },
	};
}
