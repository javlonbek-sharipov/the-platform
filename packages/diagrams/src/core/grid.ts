/**
 * The routing grid (spec: Edge routing, step 1): a sparse set of horizontal
 * and vertical lines that keep clear of the Nodes. Lines run half a clearance
 * outside each side of each Node and of each callout's tag, through the end
 * of each Port's stub, Row Ports included, and once more on each side,
 * outside the whole drawing. Where two lines cross is a vertex, and a segment
 * joins two neighboring vertices on one line.
 *
 * A segment is open only if it stays clear of every Node and tag, border
 * included. A crossing inside a Node, or on its border, has no open segment,
 * so no route can reach it: the vertices that routes use all lie outside the
 * Nodes.
 */

import type { Box, Point, SceneNode } from "./scene.ts";

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
}

export function buildGrid(nodes: SceneNode[], clearance: number): Grid {
	const half = clearance / 2;
	// A callout's tag sits above its Node, where layout leaves room for it, and
	// is in the way of routes as the Node is.
	const tags = nodes.flatMap((node) => (node.callout === undefined ? [] : [node.callout.tag]));
	const boxes = [...nodes.map((node) => node.box), ...tags];
	const xs = new Set<number>();
	const ys = new Set<number>();
	for (const { box, input, output, rows } of nodes) {
		xs.add(box.x - half).add(box.x + box.width + half);
		ys.add(box.y - half).add(box.y + box.height + half);
		for (const { stub } of [input, output, ...rows.flatMap((row) => [row.input, row.output])]) {
			xs.add(stub.x);
			ys.add(stub.y);
		}
	}
	// A tag's bottom is just above its Node, so no line runs below it.
	for (const tag of tags) {
		xs.add(tag.x - half).add(tag.x + tag.width + half);
		ys.add(tag.y - half);
	}
	const drawing = boundsOf(boxes);
	xs.add(drawing.x - clearance).add(drawing.x + drawing.width + clearance);
	ys.add(drawing.y - clearance).add(drawing.y + drawing.height + clearance);

	const grid: Grid = {
		xs: [...xs].sort((a, b) => a - b),
		ys: [...ys].sort((a, b) => a - b),
		openEast: new Uint8Array(xs.size * ys.size),
		openSouth: new Uint8Array(xs.size * ys.size),
	};
	const columns = grid.xs.length;
	grid.ys.forEach((y, j) => {
		const across = boxes.filter((box) => box.y <= y && y <= box.y + box.height);
		eachGap(grid.xs, (left, right, i) => {
			grid.openEast[j * columns + i] = across.every(
				(box) => box.x + box.width < left || right < box.x,
			)
				? 1
				: 0;
		});
	});
	grid.xs.forEach((x, i) => {
		const across = boxes.filter((box) => box.x <= x && x <= box.x + box.width);
		eachGap(grid.ys, (top, bottom, j) => {
			grid.openSouth[j * columns + i] = across.every(
				(box) => box.y + box.height < top || bottom < box.y,
			)
				? 1
				: 0;
		});
	});
	return grid;
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
