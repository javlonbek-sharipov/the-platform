/**
 * Layout: a pure function of the Diagram, with no coordinates in the source,
 * no randomness and no memory of earlier layouts. Authors steer it only with
 * the Diagram's direction and the order they declare things in, which breaks
 * every tie.
 *
 * The rank axis runs along the direction: x for `right`, y for `down`. The
 * order axis runs across it.
 */

import { type Diagram, endNode } from "../authoring/model.ts";
import { arrange, type Member } from "./layers.ts";
import { faceOf, frameOf, partsOf, rowHeight } from "./nodes.ts";
import type { Point, SceneNode, ScenePort, Side } from "./scene.ts";
import { rowTexts } from "./text.ts";

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

	// A Node is as tall as its Kind's header and its Rows' bands together. Its
	// header Ports sit on its sides along the rank axis: level with its header
	// for `right`, and halfway across it for `down`. Above the Node, a callout's
	// tag needs room, which is across the rank for `right` and along it for `down`.
	const frames = diagram.nodes.map(frameOf);
	/** From a Node's leading side across the rank to its Ports' line. */
	const toPorts = frames.map(({ width, headerTop, headerHeight }) =>
		down ? width / 2 : headerTop + headerHeight / 2,
	);
	const members: Member[] = frames.map(({ width, height, tagRoom }, at) => {
		const ports = toPorts[at] ?? 0;
		return down
			? { depth: height, lead: tagRoom, before: ports, after: width - ports }
			: { depth: width, before: tagRoom + ports, after: height - ports };
	});
	const index = new Map(diagram.nodes.map((node, at) => [node.id, at]));
	const connections = diagram.edges.map((edge) => ({
		from: index.get(endNode(edge.from)) ?? 0,
		to: index.get(endNode(edge.to)) ?? 0,
	}));
	const placements = arrange(members, connections, { clearance, rankGap, grid });

	return diagram.nodes.map((node, at) => {
		const { x: line, y: ports } = placements[at] ?? { x: 0, y: 0 };
		const { depth } = members[at] ?? { depth: 0 };
		const corner = turn(line - depth / 2, ports - (toPorts[at] ?? 0));
		const { width, height } = frames[at] ?? { width: 0, height: 0 };
		const box = { ...corner, width, height };
		const { header, badge, title, status, callout } = partsOf(node, box, diagram.direction);
		// Row text keeps to the outline's face, as the title does.
		const face = faceOf(node, box);
		return {
			id: node.id,
			kind: node.kind,
			box,
			header,
			input: port(down ? "top" : "left", turn(line - depth / 2, ports)),
			output: port(down ? "bottom" : "right", turn(line + depth / 2, ports)),
			badge,
			title,
			rows: (node.rows ?? []).map((row, index) => {
				const band = {
					x: box.x,
					y: header.y + header.height + index * rowHeight,
					width,
					height: rowHeight,
				};
				// A Row's Ports sit on the Node's left and right sides, whatever the
				// direction, level with the middle of its band.
				const level = band.y + rowHeight / 2;
				return {
					box: band,
					...rowTexts(row, { ...band, x: face.x, width: face.width }),
					input: port("left", { x: box.x, y: level }),
					output: port("right", { x: box.x + width, y: level }),
				};
			}),
			external: node.external === true,
			...(status === undefined ? {} : { status }),
			...(callout === undefined ? {} : { callout }),
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
