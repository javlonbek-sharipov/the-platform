/**
 * A Node's size and parts, from its Kind's look. Its header band holds its
 * badge at the start and its title after it, and its header Ports are level
 * with the header. Text never changes a Node's size: a title too wide for the
 * room the header leaves it is shortened instead.
 */

import type { Node } from "../authoring/model.ts";
import { architectureNodeLooks } from "../notations/architecture.ts";
import { outlines } from "./outlines.ts";
import type { Box, SceneStatus, SceneText } from "./scene.ts";
import { nodeTitle } from "./text.ts";

/** The room between the header's contents and the outline's face, on each side. */
const padding = 12;
const badgeSize = 16;
/** The room between the badge and the title, and between the title and a status mark. */
const badgeGap = 8;
const markSize = 12;

/** A Node's size, and where its header band sits in it, from its top. */
export interface NodeFrame {
	width: number;
	height: number;
	headerTop: number;
	headerHeight: number;
}

export function frameOf(node: Node): NodeFrame {
	const { width, height, outline } = architectureNodeLooks[node.kind];
	const { headRoom } = outlines[outline];
	return { width, height, headerTop: headRoom, headerHeight: height - headRoom };
}

export interface NodeParts {
	header: Box;
	badge: Box;
	title: SceneText;
	status?: SceneStatus;
}

/** Where a Node's parts go, once its box is placed. */
export function partsOf(node: Node, box: Box): NodeParts {
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
	return { header, badge, title, ...(status === undefined ? {} : { status }) };
}
