/**
 * The routing grid (spec: Edge routing, step 1): a sparse set of horizontal
 * and vertical lines that keep clear of the Nodes and the Group labels. Lines
 * run half a clearance outside each side of each Node, each Group label and
 * each Group's box, through the end of each Port's stub, and once more on
 * each side, outside the whole drawing. Where two lines cross is a vertex,
 * and a segment joins two neighboring vertices on one line.
 *
 * A segment is open only if it stays clear of every Node and every Group
 * label, border included. A crossing inside one, or on its border, has no
 * open segment, so no route can reach it: the vertices that routes use all
 * lie outside them. A segment along a Group's border is closed too, so that
 * routes cross Group borders but never run along them. The grid counts the
 * borders that each segment crosses, so that crossing one can cost a little.
 */

import type { Box, Point, SceneGroup, SceneNode } from "./scene.ts";

export interface Grid {
	/** The vertical lines, by x, in increasing order. */
	xs: number[];
	/** The horizontal lines, by y, in increasing order. */
	ys: number[];
	/**
	 * Whether the segment east of each vertex is open, by vertex. The vertex
	 * where vertical line `i` crosses horizontal line `j` is `j * xs.length + i`.
	 */
	openEast: Uint8Array;
	/** Whether the segment south of each vertex is open, by vertex. */
	openSouth: Uint8Array;
	/** How many Group borders the segment east of each vertex crosses, by vertex. */
	crossEast: Uint16Array;
	/** How many Group borders the segment south of each vertex crosses, by vertex. */
	crossSouth: Uint16Array;
}

export function buildGrid(nodes: SceneNode[], groups: SceneGroup[], clearance: number): Grid {
	const half = clearance / 2;
	/** What no route may pass through: every Node, and every Group's label. */
	const boxes = [...nodes.map((node) => node.box), ...groups.map((group) => group.label)];
	const xs = new Set<number>();
	const ys = new Set<number>();
	const borders = groups.map((group) => group.box);
	// Around a Group's box, the lines run down the middle of its parent's
	// padding and of the gaps beside it, so that a route can pass a Group
	// without crossing its border.
	for (const box of [...boxes, ...borders]) {
		xs.add(box.x - half).add(box.x + box.width + half);
		ys.add(box.y - half).add(box.y + box.height + half);
	}
	for (const { input, output } of nodes) {
		for (const { stub } of [input, output]) {
			xs.add(stub.x);
			ys.add(stub.y);
		}
	}
	const drawing = boundsOf([...boxes, ...borders]);
	xs.add(drawing.x - clearance).add(drawing.x + drawing.width + clearance);
	ys.add(drawing.y - clearance).add(drawing.y + drawing.height + clearance);

	const grid: Grid = {
		xs: [...xs].sort((a, b) => a - b),
		ys: [...ys].sort((a, b) => a - b),
		openEast: new Uint8Array(xs.size * ys.size),
		openSouth: new Uint8Array(xs.size * ys.size),
		crossEast: new Uint16Array(xs.size * ys.size),
		crossSouth: new Uint16Array(xs.size * ys.size),
	};
	const columns = grid.xs.length;
	grid.ys.forEach((y, j) => {
		const across = boxes.filter((box) => box.y <= y && y <= box.y + box.height);
		// A line can come level with a Group's top or bottom, by way of a Node far
		// from the Group. No route may run along that border.
		const along = borders.filter((box) => box.y === y || box.y + box.height === y);
		eachGap(grid.xs, (left, right, i) => {
			const clear =
				across.every((box) => box.x + box.width < left || right < box.x) &&
				along.every((box) => box.x + box.width <= left || right <= box.x);
			grid.openEast[j * columns + i] = clear ? 1 : 0;
		});
		const sides = borders
			.filter((box) => box.y < y && y < box.y + box.height)
			.flatMap((box) => [box.x, box.x + box.width]);
		countCrossings(grid.xs, sides, (i, count) => {
			grid.crossEast[j * columns + i] = count;
		});
	});
	grid.xs.forEach((x, i) => {
		const across = boxes.filter((box) => box.x <= x && x <= box.x + box.width);
		const along = borders.filter((box) => box.x === x || box.x + box.width === x);
		eachGap(grid.ys, (top, bottom, j) => {
			const clear =
				across.every((box) => box.y + box.height < top || bottom < box.y) &&
				along.every((box) => box.y + box.height <= top || bottom <= box.y);
			grid.openSouth[j * columns + i] = clear ? 1 : 0;
		});
		const sides = borders
			.filter((box) => box.x < x && x < box.x + box.width)
			.flatMap((box) => [box.y, box.y + box.height]);
		countCrossings(grid.ys, sides, (j, count) => {
			grid.crossSouth[j * columns + i] = count;
		});
	});
	return grid;
}

/**
 * For each gap between neighboring lines, how many of the Group sides that
 * cross its line lie in it. A side at a gap's far end counts for that gap,
 * and one at its near end for the gap before, so a route that crosses a
 * border at a vertex pays for it once.
 */
function countCrossings(
	lines: number[],
	sides: number[],
	each: (index: number, count: number) => void,
): void {
	sides.sort((a, b) => a - b);
	let first = 0;
	eachGap(lines, (low, high, index) => {
		while (first < sides.length && (sides[first] ?? 0) <= low) {
			first += 1;
		}
		let last = first;
		while (last < sides.length && (sides[last] ?? 0) <= high) {
			last += 1;
		}
		if (last > first) {
			each(index, last - first);
		}
	});
}

/** The vertex where the grid's lines cross at `point`, if there is one. */
export function vertexAt(grid: Grid, point: Point): number | undefined {
	const i = grid.xs.indexOf(point.x);
	const j = grid.ys.indexOf(point.y);
	return i < 0 || j < 0 ? undefined : j * grid.xs.length + i;
}

export function pointOf(grid: Grid, vertex: number): Point {
	const columns = grid.xs.length;
	const i = vertex % columns;
	return { x: grid.xs[i] ?? 0, y: grid.ys[(vertex - i) / columns] ?? 0 };
}

/** Calls `each` with the two ends of every gap between neighboring lines. */
function eachGap(lines: number[], each: (low: number, high: number, index: number) => void): void {
	for (let index = 0; index + 1 < lines.length; index++) {
		each(lines[index] ?? 0, lines[index + 1] ?? 0, index);
	}
}

function boundsOf(boxes: Box[]): Box {
	const left = Math.min(...boxes.map((box) => box.x));
	const top = Math.min(...boxes.map((box) => box.y));
	const right = Math.max(...boxes.map((box) => box.x + box.width));
	const bottom = Math.max(...boxes.map((box) => box.y + box.height));
	return { x: left, y: top, width: right - left, height: bottom - top };
}
