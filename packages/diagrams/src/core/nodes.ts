/**
 * A Node's size and parts, from its Kind's look. Its header band holds its
 * badge at the start and its title after it, and its header Ports are level
 * with the header. Text never changes a Node's size: a title too wide for the
 * room the header leaves it is shortened instead.
 */

import type { Direction, Node } from "../authoring/model.ts";
import { architectureNodeLooks } from "../notations/architecture.ts";
import { outlines } from "./outlines.ts";
import type { Box, SceneCallout, SceneStatus, SceneText } from "./scene.ts";
import { calloutText, nodeTitle } from "./text.ts";

/**
 * The band of each Row, below the header. It's two steps of 16 px, so that
 * every Node's size stays a multiple of 16 px.
 */
export const rowHeight = 32;
/** The room between the header's contents and the outline's face, on each side. */
const padding = 12;
const badgeSize = 16;
/** The room between the badge and the title, and between the title and a status mark. */
const badgeGap = 8;
const markSize = 12;
/** A callout's tag: its height, the room between it and its Node, and the room on each side of its text. */
const tagHeight = 20;
const tagGap = 4;
const tagPadding = 8;
/**
 * How far a tag keeps from the input Port of a Node laid out down, which sits
 * at the middle of its top, where Edges come in from above.
 */
const portClearance = 12;

/** A Node's size, and where its header band sits in it, from its top. */
export interface NodeFrame {
	width: number;
	height: number;
	headerTop: number;
	headerHeight: number;
	/** The room the Node needs above it for its callout's tag: none, if it has no callout. */
	tagRoom: number;
}

/** A Node's size: its Kind's, with a band for each Row below the header. */
export function frameOf(node: Node): NodeFrame {
	const { width, height, outline } = architectureNodeLooks[node.kind];
	const { headRoom } = outlines[outline];
	const tagRoom = node.callout === undefined ? 0 : tagGap + tagHeight;
	return {
		width,
		height: height + (node.rows?.length ?? 0) * rowHeight,
		headerTop: headRoom,
		headerHeight: height - headRoom,
		tagRoom,
	};
}

/** The part of a Node's width that its outline's face covers, where its text goes. */
export function faceOf(node: Node, box: Box): { x: number; width: number } {
	const { inset } = outlines[architectureNodeLooks[node.kind].outline];
	return { x: box.x + inset.left, width: box.width - inset.left - inset.right };
}

export interface NodeParts {
	header: Box;
	badge: Box;
	title: SceneText;
	status?: SceneStatus;
	callout?: SceneCallout;
}

/** Where a Node's parts go, once its box is placed. */
export function partsOf(node: Node, box: Box, direction: Direction): NodeParts {
	const { headerTop, headerHeight } = frameOf(node);
	const { inset } = outlines[architectureNodeLooks[node.kind].outline];
	const header = { x: box.x, y: box.y + headerTop, width: box.width, height: headerHeight };
	const middle = header.y + header.height / 2;
	const badge = {
		x: box.x + padding + inset.left,
		y: middle - badgeSize / 2,
		width: badgeSize,
		height: badgeSize,
	};
	const right = box.x + box.width - padding - inset.right;
	const status =
		node.status === undefined
			? undefined
			: {
					value: node.status,
					mark: {
						x: right - markSize,
						y: middle - markSize / 2,
						width: markSize,
						height: markSize,
					},
				};
	const start = badge.x + badge.width + badgeGap;
	const end = status === undefined ? right : status.mark.x - badgeGap;
	const title = nodeTitle(node.title, {
		x: start,
		y: header.y,
		width: end - start,
		height: header.height,
	});
	const callout = node.callout === undefined ? undefined : calloutOf(node.callout, box, direction);
	return {
		header,
		badge,
		title,
		...(status === undefined ? {} : { status }),
		...(callout === undefined ? {} : { callout }),
	};
}

/**
 * The tag just above a Node, at its left edge, as wide as its text. Laid out
 * right, it may be as wide as the Node. Laid out down, it stops short of the
 * input Port at the middle of the Node's top.
 */
function calloutOf(callout: string, box: Box, direction: Direction): SceneCallout {
	const widest = direction === "down" ? box.width / 2 - portClearance : box.width;
	const y = box.y - tagGap - tagHeight;
	const text = calloutText(callout, box.x + tagPadding, y + tagHeight / 2, widest - 2 * tagPadding);
	return { tag: { x: box.x, y, width: text.width + 2 * tagPadding, height: tagHeight }, text };
}
