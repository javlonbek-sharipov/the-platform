/**
 * The outlines a Kind's look can take. Each one is drawn inside its Node's
 * rectangle, strokes included, and leaves the header band free for the badge
 * and the title. The drawing is path data, which any renderer can write out.
 */

import type { Box } from "./scene.ts";

export type Outline =
	| "figure"
	| "heavy"
	| "window"
	| "hexagon"
	| "rounded"
	| "stack"
	| "chamfer"
	| "cylinder"
	| "chip"
	| "pipe"
	| "page"
	| "pill"
	| "oval";

/** Path data: commands, such as `M` and `A`, followed by their numbers. */
export type PathData = (string | number)[];

/** An outline drawn in a box. */
export interface OutlineDrawing {
	/** The closed shapes of the silhouette, each filled with the surface, tinted with the hue and stroked. */
	shapes: PathData[];
	/** Parts filled in the hue, such as a window's title bar, drawn under the shapes' strokes. */
	solids: PathData[];
	/** Lines stroked in the hue, such as a cylinder's lid. */
	details: PathData[];
}

export interface OutlineLook {
	/** The room above the header band, such as for a person's head. */
	headRoom: number;
	/**
	 * How far the outline's face starts in from each side, beyond the header's
	 * padding, and down from the header's top, past a lid or a title bar.
	 */
	inset: { left: number; right: number; top: number };
	/** The width of the stroke around the shapes, and of the details' strokes. */
	stroke: number;
	detail: number;
	/** How strongly the hue tints the surface, as the shapes' fill opacity. */
	tint: number;
	/**
	 * Draws the outline in a Node's box, with strokes of the given width,
	 * keeping every stroke inside it. The header is the band at its top that
	 * holds the badge and the title, above any Rows. Wherever the Node has a
	 * Port, at the middle of its header and of each Row's band, the outline
	 * meets the box's side.
	 */
	draw(box: Box, stroke: number, header: Box): OutlineDrawing;
}

/** Moves each side of a box inward. */
function shrink(box: Box, by: number): Box {
	return { x: box.x + by, y: box.y + by, width: box.width - 2 * by, height: box.height - 2 * by };
}

/** A rectangle with each corner rounded by its own radius: top left, top right, bottom right, bottom left. */
function corners(box: Box, [tl, tr, br, bl]: [number, number, number, number]): PathData {
	const { x, y, width, height } = box;
	const [right, bottom] = [x + width, y + height];
	const arc = (radius: number, toX: number, toY: number): PathData =>
		radius === 0 ? ["L", toX, toY] : ["A", radius, radius, 0, 0, 1, toX, toY];
	return [
		...["M", x + tl, y],
		...["H", right - tr],
		...arc(tr, right, y + tr),
		...["V", bottom - br],
		...arc(br, right - br, bottom),
		...["H", x + bl],
		...arc(bl, x, bottom - bl),
		...["V", y + tl],
		...arc(tl, x + tl, y),
		"Z",
	];
}

function rounded(box: Box, radius: number): PathData {
	return corners(box, [radius, radius, radius, radius]);
}

function polygon(points: [number, number][]): PathData {
	return points.flatMap(([x, y], index) => [index === 0 ? "M" : "L", x, y]).concat("Z");
}

function circle(centerX: number, centerY: number, radius: number): PathData {
	return [
		...["M", centerX - radius, centerY],
		...["A", radius, radius, 0, 1, 0, centerX + radius, centerY],
		...["A", radius, radius, 0, 1, 0, centerX - radius, centerY],
		"Z",
	];
}

const none: OutlineDrawing = { shapes: [], solids: [], details: [] };

const plain = {
	headRoom: 0,
	inset: { left: 0, right: 0, top: 0 },
	stroke: 1.5,
	detail: 1.5,
	tint: 0.08,
};

/** A person's head, above the header band. */
const headRoom = 32;
/** The radii of a person's shoulders. */
const shoulders = { x: 44, y: 20 };
/** How far a worker's back card is offset from its front card. */
const stackOffset = 5;
/**
 * The radius of a corner below a header, such as a pill's: half a Row's band,
 * so that the Ports at the middle of the last Row still meet a straight side.
 */
const rowCorner = 16;
/** How deep a cylinder's lid is, and how wide a pipe's ends are. */
const lidDepth = 7;
const pipeEnd = 9;
/** The length of a chip's pins, and the room between them. */
const pinLength = 5;
const pinSpacing = 18;
/** The size of a page's folded corner. */
const fold = 14;
/** The height of a window's title bar, from the top of its Node. */
const titleBar = 9;

export const outlines: Record<Outline, OutlineLook> = {
	// A head above rounded shoulders.
	figure: {
		...plain,
		headRoom,
		draw(box, stroke) {
			const { x, y, width, height } = shrink(box, stroke / 2);
			const [right, bottom] = [x + width, y + height];
			const top = box.y + headRoom;
			const body: PathData = [
				...["M", x, top + shoulders.y],
				...["A", shoulders.x, shoulders.y, 0, 0, 1, x + shoulders.x, top],
				...["H", right - shoulders.x],
				...["A", shoulders.x, shoulders.y, 0, 0, 1, right, top + shoulders.y],
				...["V", bottom - 8],
				...["A", 8, 8, 0, 0, 1, right - 8, bottom],
				...["H", x + 8],
				...["A", 8, 8, 0, 0, 1, x, bottom - 8],
				"Z",
			];
			const radius = (headRoom - 2) / 2;
			return {
				...none,
				shapes: [body, circle(box.x + box.width / 2, box.y + radius, radius - stroke / 2)],
			};
		},
	},
	// A thick border with a frame inside it.
	heavy: {
		...plain,
		stroke: 3,
		detail: 1,
		tint: 0.16,
		draw(box, stroke) {
			const outer = shrink(box, stroke / 2);
			return { ...none, shapes: [rounded(outer, 10)], details: [rounded(shrink(outer, 4.5), 6)] };
		},
	},
	// An app's window, with a title bar.
	window: {
		...plain,
		inset: { left: 0, right: 0, top: titleBar },
		draw(box, stroke) {
			const outer = shrink(box, stroke / 2);
			const bar = { ...outer, height: titleBar - stroke / 2 };
			return { ...none, shapes: [rounded(outer, 6)], solids: [corners(bar, [6, 6, 0, 0])] };
		},
	},
	// Pointed at both ends, like a gate traffic passes through. The points are
	// level with the header. Below a header with Rows, the sides run straight
	// down to cut corners.
	hexagon: {
		...plain,
		draw(box, stroke, header) {
			const { x, y, width, height } = shrink(box, stroke / 2);
			const [right, bottom] = [x + width, y + height];
			const point = 14;
			const middle = header.y + header.height / 2;
			const lower: [number, number][] =
				header.y + header.height < box.y + box.height
					? [
							[right, bottom - rowCorner / 2],
							[right - rowCorner / 2, bottom],
							[x + rowCorner / 2, bottom],
							[x, bottom - rowCorner / 2],
						]
					: [
							[right - point, bottom],
							[x + point, bottom],
						];
			const shape = polygon([
				[x + point, y],
				[right - point, y],
				[right, middle],
				...lower,
				[x, middle],
			]);
			return { ...none, shapes: [shape] };
		},
	},
	rounded: {
		...plain,
		draw: (box, stroke) => ({ ...none, shapes: [rounded(shrink(box, stroke / 2), 8)] }),
	},
	// Two cards, one behind the other, for the many jobs a worker takes on.
	stack: {
		...plain,
		inset: { left: 0, right: stackOffset, top: 0 },
		draw(box, stroke) {
			const { x, y, width, height } = shrink(box, stroke / 2);
			const card = { width: width - stackOffset, height: height - stackOffset };
			return {
				...none,
				shapes: [
					rounded({ x: x + stackOffset, y, ...card }, 7),
					rounded({ x, y: y + stackOffset, ...card }, 7),
				],
			};
		},
	},
	// A rectangle with its corners cut off.
	chamfer: {
		...plain,
		draw(box, stroke) {
			const { x, y, width, height } = shrink(box, stroke / 2);
			const cut = 10;
			const [right, bottom] = [x + width, y + height];
			const shape = polygon([
				[x + cut, y],
				[right - cut, y],
				[right, y + cut],
				[right, bottom - cut],
				[right - cut, bottom],
				[x + cut, bottom],
				[x, bottom - cut],
				[x, y + cut],
			]);
			return { ...none, shapes: [shape] };
		},
	},
	// Standing upright, with its lid showing.
	cylinder: {
		...plain,
		// The lid's front edge dips to twice its depth, and its stroke a little further.
		inset: { left: 0, right: 0, top: 2 * lidDepth + 2 },
		draw(box, stroke) {
			const { x, y, width, height } = shrink(box, stroke / 2);
			const [right, bottom] = [x + width, y + height];
			const across = width / 2;
			const body: PathData = [
				...["M", x, y + lidDepth],
				...["V", bottom - lidDepth],
				...["A", across, lidDepth, 0, 0, 0, right, bottom - lidDepth],
				...["V", y + lidDepth],
				...["A", across, lidDepth, 0, 0, 0, x, y + lidDepth],
				"Z",
			];
			const lid: PathData = [
				...["M", x, y + lidDepth],
				...["A", across, lidDepth, 0, 0, 0, right, y + lidDepth],
			];
			return { ...none, shapes: [body], details: [lid] };
		},
	},
	// A memory chip, with pins along its top and bottom.
	chip: {
		...plain,
		inset: { left: 0, right: 0, top: pinLength },
		draw(box, stroke) {
			const { x, width } = shrink(box, stroke / 2);
			const body = { x, y: box.y + pinLength, width, height: box.height - 2 * pinLength };
			const center = box.x + box.width / 2;
			const pins: PathData[] = [];
			const reach = Math.floor((box.width / 2 - 14) / pinSpacing);
			for (let step = -reach; step <= reach; step += 1) {
				const pinX = center + step * pinSpacing;
				pins.push(
					["M", pinX, box.y + stroke / 2, "V", body.y],
					["M", pinX, body.y + body.height, "V", box.y + box.height - stroke / 2],
				);
			}
			return { ...none, shapes: [rounded(body, 4)], details: pins };
		},
	},
	// Lying on its side, open toward the right. Each end is half an ellipse as
	// tall as the header. When Rows make the Node taller, the ends run straight
	// down the Rows, and round off at the bottom over half a Row's band.
	pipe: {
		...plain,
		inset: { left: 0, right: 2 * pipeEnd, top: 0 },
		draw(box, stroke, header) {
			const { x, y, width, height } = shrink(box, stroke / 2);
			const [right, bottom] = [x + width, y + height];
			const top = (header.height - stroke) / 2;
			const rows = header.y + header.height < box.y + box.height;
			const lower = rows ? rowCorner - stroke / 2 : top;
			const body: PathData = [
				...["M", x + pipeEnd, y],
				...["H", right - pipeEnd],
				...["A", pipeEnd, top, 0, 0, 1, right, y + top],
				...["V", bottom - lower],
				...["A", pipeEnd, lower, 0, 0, 1, right - pipeEnd, bottom],
				...["H", x + pipeEnd],
				...["A", pipeEnd, lower, 0, 0, 1, x, bottom - lower],
				...["V", y + top],
				...["A", pipeEnd, top, 0, 0, 1, x + pipeEnd, y],
				"Z",
			];
			const opening: PathData = [
				...["M", right - pipeEnd, y],
				...["A", pipeEnd, top, 0, 0, 0, right - 2 * pipeEnd, y + top],
				...["V", bottom - lower],
				...["A", pipeEnd, lower, 0, 0, 0, right - pipeEnd, bottom],
			];
			return { ...none, shapes: [body], details: [opening] };
		},
	},
	// A sheet with its corner folded over.
	page: {
		...plain,
		draw(box, stroke) {
			const { x, y, width, height } = shrink(box, stroke / 2);
			const [right, bottom] = [x + width, y + height];
			return {
				...none,
				shapes: [
					polygon([
						[x, y],
						[right - fold, y],
						[right, y + fold],
						[right, bottom],
						[x, bottom],
					]),
				],
				solids: [
					polygon([
						[right - fold, y],
						[right - fold, y + fold],
						[right, y + fold],
					]),
				],
				details: [["M", right - fold, y, "V", y + fold, "H", right]],
			};
		},
	},
	// Rounded right through at both ends, like a search field. Below a header
	// with Rows, its corners round less.
	pill: {
		...plain,
		draw(box, stroke, header) {
			const outer = shrink(box, stroke / 2);
			const rows = header.y + header.height < box.y + box.height;
			return { ...none, shapes: [rounded(outer, rows ? rowCorner : outer.height / 2)] };
		},
	},
	// An ellipse, which touches its Node's rectangle at the middle of each side.
	// Below a header with Rows, only the header's upper half arches: the sides
	// run straight down from its middle, and round off at the bottom.
	oval: {
		...plain,
		// Its ends narrow, so the header's contents keep a little further in.
		inset: { left: 4, right: 4, top: 0 },
		draw(box, stroke, header) {
			const { x, y, width, height } = shrink(box, stroke / 2);
			const [right, bottom] = [x + width, y + height];
			const across = width / 2;
			const rows = header.y + header.height < box.y + box.height;
			if (!rows) {
				const middle = y + height / 2;
				const up = height / 2;
				return {
					...none,
					shapes: [
						[
							...["M", x, middle],
							...["A", across, up, 0, 0, 1, right, middle],
							...["A", across, up, 0, 0, 1, x, middle],
							"Z",
						],
					],
				};
			}
			const middle = header.y + header.height / 2;
			const corner = rowCorner - stroke / 2;
			return {
				...none,
				shapes: [
					[
						...["M", x, middle],
						...["A", across, middle - y, 0, 0, 1, right, middle],
						...["V", bottom - corner],
						...["A", corner, corner, 0, 0, 1, right - corner, bottom],
						...["H", x + corner],
						...["A", corner, corner, 0, 0, 1, x, bottom - corner],
						"Z",
					],
				],
			};
		},
	},
};
