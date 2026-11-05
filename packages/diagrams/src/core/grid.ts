/**
 * The routing grid (spec: Edge routing, step 1): a sparse set of horizontal
 * and vertical lines that keep clear of the Nodes and the Group labels. Lines
 * run half a clearance outside each side of each Node, each callout's tag,
 * each Group label and each Group's box, through the end of each Port's stub,
 * Row Ports included, and once more on each side, outside the whole drawing.
 * Where two lines cross is a vertex, and a segment joins two neighboring
 * vertices on one line.
 *
 * A segment is open only if it stays clear of every Node, tag and Group
 * label, border included. A crossing inside one, or on its border, has no
 * open segment, so no route can reach it: the vertices that routes use all
 * lie outside them. A segment along a Group's border is closed too, so that
 * routes cross Group borders but never run along them. The grid counts the
 * borders that each segment crosses, so that crossing one can cost a little.
 *
 * Each segment also lies in a corridor, with a capacity (spec: Edge routing,
 * step 2): its free width, from the nearest obstacle or Group border on one
 * side of it to the nearest on the other, divided by the lane spacing. That's
 * how many lanes fit through it side by side. Parallel segments over the same
 * stretch, between the same two sides, lie in one corridor and share its
 * capacity, since their lanes spread across the one width.
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
	/**
	 * The corridor that each segment lies in: the one east of vertex `v` at
	 * `2 * v`, and the one south of it at `2 * v + 1`.
	 */
	corridorOf: Uint32Array;
	/** How many lanes fit through each corridor. */
	capacity: Uint16Array;
	/** The segments of each corridor, by corridor. */
	corridors: number[][];
}

/** The most lanes a segment counts as holding, which open space beyond every obstacle has. */
const roomy = 1000;

export function buildGrid(
	nodes: SceneNode[],
	groups: SceneGroup[],
	clearance: number,
	laneSpacing: number,
): Grid {
	const half = clearance / 2;
	// A callout's tag sits above its Node, where layout leaves room for it, and
	// is in the way of routes as the Node is. So is a Group's label.
	const tags = nodes.flatMap((node) => (node.callout === undefined ? [] : [node.callout.tag]));
	const labels = groups.map((group) => group.label);
	const boxes = [...nodes.map((node) => node.box), ...tags, ...labels];
	const borders = groups.map((group) => group.box);
	const xs = new Set<number>();
	const ys = new Set<number>();
	// Around a Group's box, the lines run down the middle of its parent's
	// padding and of the gaps beside it, so that a route can pass a Group
	// without crossing its border.
	for (const box of [...nodes.map((node) => node.box), ...labels, ...borders]) {
		xs.add(box.x - half).add(box.x + box.width + half);
		ys.add(box.y - half).add(box.y + box.height + half);
	}
	for (const { input, output, rows } of nodes) {
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
		corridorOf: new Uint32Array(2 * xs.size * ys.size),
		capacity: new Uint16Array(0),
		corridors: [],
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
	measureCapacity(grid, boxes, borders, laneSpacing);
	return grid;
}

/**
 * Sets each segment's corridor, and each corridor's capacity: its free width
 * across it, divided by the lane spacing. The free width runs from the
 * nearest obstacle on one side to the nearest on the other, among those
 * beside the segment along its length: boxes, and the sides of Group boxes
 * that run the same way. Parallel segments between the same two grid lines
 * along them, with the same nearest obstacles on both sides, share a corridor.
 */
function measureCapacity(grid: Grid, boxes: Box[], borders: Box[], laneSpacing: number): void {
	const columns = grid.xs.length;
	const ids = new Map<string, number>();
	const capacity: number[] = [];
	for (const horizontal of [true, false]) {
		const lines = horizontal ? grid.ys : grid.xs;
		const stops = horizontal ? grid.xs : grid.ys;
		const across = (box: Box): [number, number] =>
			horizontal ? [box.y, box.y + box.height] : [box.x, box.x + box.width];
		const along = (box: Box): [number, number] =>
			horizontal ? [box.x, box.x + box.width] : [box.y, box.y + box.height];
		lines.forEach((line, j) => {
			const low = new Float64Array(stops.length).fill(Number.NEGATIVE_INFINITY);
			const high = new Float64Array(stops.length).fill(Number.POSITIVE_INFINITY);
			const bound = (start: number, end: number, side: number) => {
				for (let i = firstGapAfter(stops, start); i + 1 < stops.length; i += 1) {
					if ((stops[i] ?? 0) >= end) {
						break;
					}
					if (side <= line) {
						low[i] = Math.max(low[i] ?? 0, side);
					}
					if (side >= line) {
						high[i] = Math.min(high[i] ?? 0, side);
					}
				}
			};
			for (const box of boxes) {
				const [near, far] = across(box);
				const [start, end] = along(box);
				if (far <= line) {
					bound(start, end, far);
				} else if (near >= line) {
					bound(start, end, near);
				}
			}
			for (const box of borders) {
				const [start, end] = along(box);
				for (const side of across(box)) {
					if (side !== line) {
						bound(start, end, side);
					}
				}
			}
			for (let i = 0; i + 1 < stops.length; i += 1) {
				const [from = 0, to = 0] = [low[i], high[i]];
				const vertex = horizontal ? j * columns + i : i * columns + j;
				const segment = 2 * vertex + (horizontal ? 0 : 1);
				const key = `${horizontal ? "h" : "v"} ${i} ${from} ${to}`;
				let id = ids.get(key);
				if (id === undefined) {
					id = capacity.length;
					ids.set(key, id);
					const width = to - from;
					capacity.push(
						Number.isFinite(width) ? Math.min(roomy, Math.floor(width / laneSpacing)) : roomy,
					);
					grid.corridors.push([]);
				}
				grid.corridorOf[segment] = id;
				grid.corridors[id]?.push(segment);
			}
		});
	}
	grid.capacity = Uint16Array.from(capacity);
}

/** The index of the first gap between neighboring stops that ends after `position`. */
function firstGapAfter(stops: number[], position: number): number {
	let low = 0;
	let high = stops.length - 1;
	while (low < high) {
		const middle = (low + high) >> 1;
		if ((stops[middle + 1] ?? 0) <= position) {
			low = middle + 1;
		} else {
			high = middle;
		}
	}
	return low;
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
