/**
 * Layout: a pure function of the Diagram, with no coordinates in the source,
 * no randomness and no memory of earlier layouts. Authors steer it only with
 * the Diagram's direction, the nesting of its Groups, and the order they
 * declare things in, which breaks every tie.
 *
 * The rank axis runs along the direction: x for `right`, y for `down`. The
 * order axis runs across it.
 *
 * Groups are laid out from the inside out, one level at a time. A level is
 * the Diagram itself, or one Group, and lays out its own members together. A
 * member that is a Group counts as one block, of the size its own level gave
 * it. An Edge between Nodes inside two different members connects those two
 * members, and an Edge that leaves the level is ignored there.
 */

import { type Diagram, type Direction, type Edge, endNode, parentsOf } from "../authoring/model.ts";
import { type Bundling, laneGroups, lanes } from "./bundles.ts";
import { roundUp } from "./geometry.ts";
import { labelEnds, labelSize } from "./labels.ts";
import { arrange, type Connection, type Member } from "./layers.ts";
import { faceOf, frameOf, type NodeFrame, partsOf, rowHeight } from "./nodes.ts";
import type { Box, Point, SceneGroup, SceneNode, ScenePort, Side } from "./scene.ts";
import { groupLabelPadding, groupTitle, rowTexts } from "./text.ts";

const rankGap = 96;
export const clearance = 32;
/** Node sizes are multiples of twice the grid, so that their corners land on it too. */
export const grid = 8;
export const margin = 24;

/**
 * The room between a Group's border and its members, at its sides and its
 * bottom. It's a whole clearance, more than half of one, so that the routing
 * grid's lines half a clearance outside the members run down the middle of
 * the padding, never on the Group's border.
 */
const groupPadding = clearance;
/** The height of the band along the top of a Group that holds its label. */
const labelBand = 24;
/** Below its label band, a Group's members keep a clearance from its label. */
const groupTop = labelBand + clearance;

/**
 * A Port's stub is half a clearance long, so it ends on the routing grid's
 * line beside its side.
 */
const stubLength = clearance / 2;

export interface Layout {
	nodes: SceneNode[];
	/** In model order. */
	groups: SceneGroup[];
}

/** A laid-out level: its size, and where everything in it sits, from its top-left corner. */
interface Level {
	width: number;
	height: number;
	/** The top-left corner of each Node's box. */
	nodes: Map<string, Point>;
	/** The box of each Group. */
	groups: Map<string, Box>;
}

/** A member of a level, laid out: a Node, or a Group with everything in it. */
interface Block extends Level {
	/**
	 * The room at the block's top for the tag above a Node with a callout. A
	 * Group holds its members' tags inside its box, so its block has none.
	 */
	tagRoom: number;
}

/** An empty Group keeps room for one Node of the usual size, 176 by 48 px, so that its title has room too. */
const emptyGroup = { width: 176, height: 48 };

/**
 * A direction's axes: the rank axis runs along it, x for `right` and y for
 * `down`, and the order axis runs across it. Layout works out every position
 * as a distance along each, and these turn it into a point.
 */
interface Axes {
	rank: "x" | "y";
	order: "x" | "y";
	/** The sides of a Node that its header's input and output Ports sit on. */
	input: Side;
	output: Side;
	/**
	 * From a Node's leading side across the rank to its header Ports' line:
	 * level with its header for `right`, and halfway across it for `down`.
	 */
	toPorts: (frame: NodeFrame) => number;
}

const axesOf: Record<Direction, Axes> = {
	right: {
		rank: "x",
		order: "y",
		input: "left",
		output: "right",
		toPorts: ({ headerTop, headerHeight }) => headerTop + headerHeight / 2,
	},
	down: {
		rank: "y",
		order: "x",
		input: "top",
		output: "bottom",
		toPorts: ({ width }) => width / 2,
	},
};

/** How far a box reaches along each axis. */
const extentOf = { x: "width", y: "height" } as const;

/**
 * Lays the Diagram out. Each gap between ranks leaves room for a lane for
 * each lane group whose Edges cross it, so layout takes the bundling, and the
 * labeled Edges that keep lanes of their own, as the router will route them.
 */
export function layOut(
	diagram: Diagram,
	bundle: Bundling,
	ownLanes: ReadonlySet<string> = new Set(),
): Layout {
	const axes = axesOf[diagram.direction];
	const { rank, order } = axes;
	/** The point that lies `along` the rank axis and `across` it. */
	const pointAt = (along: number, across: number): Point =>
		rank === "x" ? { x: along, y: across } : { x: across, y: along };
	/**
	 * The room an Edge's label needs along the rank axis, in a gap between
	 * ranks, with some to spare at each end: as wide as its box for `right`,
	 * where it sits above or below a run across the gap, and as tall for
	 * `down`.
	 */
	const labelRoom = (edge: Edge) => {
		const size = labelSize(edge);
		return size === undefined ? 0 : size[extentOf[rank]] + 2 * labelEnds;
	};
	// Each Edge's lane group, so that each gap between ranks leaves room for a
	// lane for each group that crosses it.
	const laneOf = laneGroups(diagram, bundle, ownLanes);
	const groupsById = new Map(diagram.groups.map((group) => [group.id, group]));
	// A Node is as tall as its Kind's header and its Rows' bands together.
	const frames = new Map(diagram.nodes.map((node) => [node.id, frameOf(node)]));
	/** The Group that each Node or Group is a member of, unless it's on the Diagram itself. */
	const parentOf = parentsOf(diagram);

	const blockOf = (id: string): Block => {
		const group = groupsById.get(id);
		if (group === undefined) {
			const frame = frames.get(id);
			if (frame === undefined) {
				throw new Error(
					`${id} is neither a Node nor a Group, which validation should have rejected`,
				);
			}
			const { width, height, tagRoom } = frame;
			return {
				width,
				height: tagRoom + height,
				tagRoom,
				nodes: new Map([[id, { x: 0, y: tagRoom }]]),
				groups: new Map(),
			};
		}
		const content: Level =
			group.members.length === 0
				? { ...emptyGroup, nodes: new Map(), groups: new Map() }
				: layOutLevel(group.members);
		// Whole steps of twice the grid, so that a Group centered on a rank's line
		// has its corners on the grid, as a Node does.
		const width = roundUp(groupPadding + content.width + groupPadding, 2 * grid);
		const height = roundUp(groupTop + content.height + groupPadding, 2 * grid);
		const block: Block = {
			width,
			height,
			tagRoom: 0,
			nodes: new Map(),
			groups: new Map([[id, { x: 0, y: 0, width, height }]]),
		};
		place(block, content, { x: groupPadding, y: groupTop });
		return block;
	};

	/** Lays out one level's members, and returns what they make together. */
	const layOutLevel = (members: string[]): Level => {
		const blocks = members.map(blockOf);
		const index = new Map(members.map((id, at) => [id, at]));
		/** The member of this level that holds a Node, unless the Node lies outside the level. */
		const memberHolding = (node: string): number | undefined => {
			for (let at: string | undefined = node; at !== undefined; at = parentOf.get(at)) {
				const member = index.get(at);
				if (member !== undefined) {
					return member;
				}
			}
			return undefined;
		};
		const connections: Connection[] = [];
		/** For each member, the Node inside it that its first connection joins. */
		const anchors = new Map<number, string>();
		for (const edge of diagram.edges) {
			const fromNode = endNode(edge.from);
			const toNode = endNode(edge.to);
			const from = memberHolding(fromNode);
			const to = memberHolding(toNode);
			if (from === undefined || to === undefined) {
				continue;
			}
			connections.push({ from, to, lane: laneOf.get(edge.id) ?? edge.id, label: labelRoom(edge) });
			if (from !== to) {
				anchors.set(from, anchors.get(from) ?? fromNode);
				anchors.set(to, anchors.get(to) ?? toNode);
			}
		}

		// A member's Ports' line is that of the Node its first connection joins, so
		// that layout can line that connection up. Above a Node, a callout's tag
		// needs room: across the rank for `right`, and along it for `down`, where
		// it doesn't move the rank's line.
		const measured = blocks.map((block, member): Member => {
			const anchor = anchors.get(member) ?? [...block.nodes.keys()][0];
			const corner = anchor === undefined ? undefined : block.nodes.get(anchor);
			const frame = anchor === undefined ? undefined : frames.get(anchor);
			const breadth = block[extentOf[order]];
			const ports =
				corner === undefined || frame === undefined
					? Math.floor(breadth / 2 / grid) * grid
					: corner[order] + axes.toPorts(frame);
			// The tag sits above the Node, so its room lies along y.
			const lead = rank === "y" ? block.tagRoom : 0;
			return {
				depth: block[extentOf[rank]] - lead,
				...(lead === 0 ? {} : { lead }),
				before: ports,
				after: breadth - ports,
			};
		});
		const placements = arrange(measured, connections, {
			clearance,
			rankGap,
			grid,
			laneSpacing: lanes.spacing,
			stubs: 2 * stubLength,
		});

		const level: Level = { width: 0, height: 0, nodes: new Map(), groups: new Map() };
		blocks.forEach((block, member) => {
			const { x: line, y: ports } = placements[member] ?? { x: 0, y: 0 };
			const { depth, lead = 0, before } = measured[member] ?? { depth: 0, before: 0 };
			const along = line - depth / 2 - lead;
			const across = ports - before;
			place(level, block, pointAt(along, across));
		});
		return level;
	};

	const drawing = layOutLevel(diagram.members);
	const origin = { x: margin, y: margin };

	const nodes = diagram.nodes.map((node): SceneNode => {
		const corner = drawing.nodes.get(node.id) ?? { x: 0, y: 0 };
		const frame = frames.get(node.id) ?? frameOf(node);
		const { width, height } = frame;
		const box = { x: origin.x + corner.x, y: origin.y + corner.y, width, height };
		const ports = box[order] + axes.toPorts(frame);
		const { header, badge, title, technology, logo, status, callout } = partsOf(
			node,
			box,
			diagram.direction,
		);
		// Row text keeps to the outline's face, as the title does.
		const face = faceOf(node, box);
		return {
			id: node.id,
			kind: node.kind,
			box,
			header,
			input: port(axes.input, pointAt(box[rank], ports)),
			output: port(axes.output, pointAt(box[rank] + box[extentOf[rank]], ports)),
			badge,
			title,
			...(technology === undefined ? {} : { technology }),
			...(logo === undefined ? {} : { logo }),
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

	const groups = diagram.groups.map((group): SceneGroup => {
		const placed = drawing.groups.get(group.id) ?? { x: 0, y: 0, width: 0, height: 0 };
		const box = { ...placed, x: origin.x + placed.x, y: origin.y + placed.y };
		const title = groupTitle(group.title, { ...box, height: labelBand });
		const label = {
			x: box.x,
			y: box.y,
			width: Math.min(
				roundUp(groupLabelPadding + title.width + groupLabelPadding, grid),
				box.width,
			),
			height: labelBand,
		};
		let depth = 0;
		for (let at = parentOf.get(group.id); at !== undefined; at = parentOf.get(at)) {
			depth += 1;
		}
		return { id: group.id, kind: group.kind, box, label, depth, title };
	});

	return { nodes, groups };
}

/** Puts a block into a level at `corner`, growing the level to hold it. */
function place(level: Level, block: Level, corner: Point): void {
	for (const [id, point] of block.nodes) {
		level.nodes.set(id, { x: corner.x + point.x, y: corner.y + point.y });
	}
	for (const [id, box] of block.groups) {
		level.groups.set(id, { ...box, x: corner.x + box.x, y: corner.y + box.y });
	}
	level.width = Math.max(level.width, corner.x + block.width);
	level.height = Math.max(level.height, corner.y + block.height);
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
