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

import type { Diagram } from "../authoring/model.ts";
import { arrange, type Connection, type Member } from "./layers.ts";
import type { Box, Point, SceneGroup, SceneNode, ScenePort, Side } from "./scene.ts";
import { groupTitle, nodeTitle, titlePadding } from "./text.ts";

const nodeWidth = 160;
const nodeHeight = 48;
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

/** A Node, or a laid-out level: its size, and where everything in it sits, from its top-left corner. */
interface Block {
	width: number;
	height: number;
	/** The top-left corner of each Node's box. */
	nodes: Map<string, Point>;
	/** The box of each Group. */
	groups: Map<string, Box>;
}

export function layOut(diagram: Diagram): Layout {
	const down = diagram.direction === "down";
	const groupsById = new Map(diagram.groups.map((group) => [group.id, group]));
	/** The Group that each Node or Group is a member of, unless it's on the Diagram itself. */
	const parentOf = new Map<string, string>();
	for (const group of diagram.groups) {
		for (const member of group.members) {
			parentOf.set(member, group.id);
		}
	}

	const blockOf = (id: string): Block => {
		const group = groupsById.get(id);
		if (group === undefined) {
			return {
				width: nodeWidth,
				height: nodeHeight,
				nodes: new Map([[id, { x: 0, y: 0 }]]),
				groups: new Map(),
			};
		}
		// An empty Group keeps room for one Node, so that its title has room too.
		const content =
			group.members.length === 0
				? { width: nodeWidth, height: nodeHeight, nodes: new Map(), groups: new Map() }
				: layOutLevel(group.members);
		// Whole steps of twice the grid, so that a Group centered on a rank's line
		// has its corners on the grid, as a Node does.
		const width = roundUp(groupPadding + content.width + groupPadding, 2 * grid);
		const height = roundUp(groupTop + content.height + groupPadding, 2 * grid);
		const block: Block = {
			width,
			height,
			nodes: new Map(),
			groups: new Map([[id, { x: 0, y: 0, width, height }]]),
		};
		place(block, content, { x: groupPadding, y: groupTop });
		return block;
	};

	/** Lays out one level's members, and returns the block they make together. */
	const layOutLevel = (members: string[]): Block => {
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
			const from = memberHolding(edge.from);
			const to = memberHolding(edge.to);
			if (from === undefined || to === undefined) {
				continue;
			}
			connections.push({ from, to });
			if (from !== to) {
				anchors.set(from, anchors.get(from) ?? edge.from);
				anchors.set(to, anchors.get(to) ?? edge.to);
			}
		}

		// A member's Ports' line is that of the Node its first connection joins, so
		// that layout can line that connection up. A Node's header Ports sit
		// halfway across it.
		const measured = blocks.map((block, member): Member => {
			const [depth, breadth] = down ? [block.height, block.width] : [block.width, block.height];
			const anchor = anchors.get(member) ?? [...block.nodes.keys()][0];
			const corner = anchor === undefined ? undefined : block.nodes.get(anchor);
			const ports =
				corner === undefined
					? Math.floor(breadth / 2 / grid) * grid
					: down
						? corner.x + nodeWidth / 2
						: corner.y + nodeHeight / 2;
			return { depth, before: ports, after: breadth - ports };
		});
		const placements = arrange(measured, connections, { clearance, rankGap, grid });

		const level: Block = { width: 0, height: 0, nodes: new Map(), groups: new Map() };
		blocks.forEach((block, member) => {
			const { x: line, y: ports } = placements[member] ?? { x: 0, y: 0 };
			const { depth, before } = measured[member] ?? { depth: 0, before: 0 };
			const along = line - depth / 2;
			const across = ports - before;
			place(level, block, down ? { x: across, y: along } : { x: along, y: across });
		});
		return level;
	};

	const drawing = layOutLevel(diagram.members);
	const origin = { x: margin, y: margin };

	const nodes = diagram.nodes.map((node): SceneNode => {
		const corner = drawing.nodes.get(node.id) ?? { x: 0, y: 0 };
		const box = {
			x: origin.x + corner.x,
			y: origin.y + corner.y,
			width: nodeWidth,
			height: nodeHeight,
		};
		const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
		return {
			id: node.id,
			kind: node.kind,
			box,
			input: down
				? port("top", { x: middle.x, y: box.y })
				: port("left", { x: box.x, y: middle.y }),
			output: down
				? port("bottom", { x: middle.x, y: box.y + box.height })
				: port("right", { x: box.x + box.width, y: middle.y }),
			title: nodeTitle(node.title, box),
		};
	});

	const groups = diagram.groups.map((group): SceneGroup => {
		const placed = drawing.groups.get(group.id) ?? { x: 0, y: 0, width: 0, height: 0 };
		const box = { ...placed, x: origin.x + placed.x, y: origin.y + placed.y };
		const title = groupTitle(group.title, { ...box, height: labelBand });
		const label = {
			x: box.x,
			y: box.y,
			width: Math.min(roundUp(titlePadding + title.width + titlePadding, grid), box.width),
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
function place(level: Block, block: Block, corner: Point): void {
	for (const [id, point] of block.nodes) {
		level.nodes.set(id, { x: corner.x + point.x, y: corner.y + point.y });
	}
	for (const [id, box] of block.groups) {
		level.groups.set(id, { ...box, x: corner.x + box.x, y: corner.y + box.y });
	}
	level.width = Math.max(level.width, corner.x + block.width);
	level.height = Math.max(level.height, corner.y + block.height);
}

/** The first multiple of `step` at or after `value`. */
function roundUp(value: number, step: number): number {
	return Math.ceil(value / step) * step;
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
