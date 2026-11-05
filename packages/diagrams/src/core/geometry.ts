/** Plane geometry that layout, routing, the marks and the SVG writer share. */

import type { Box, Point } from "./scene.ts";

/**
 * A stretch of one horizontal or vertical line: which way the line runs,
 * where it lies across, and where the stretch starts and ends along it.
 */
export interface LineSpan {
	horizontal: boolean;
	/** The line's coordinate: y for a horizontal line, x for a vertical one. */
	line: number;
	low: number;
	high: number;
}

/** The unit vector along a horizontal or vertical run, from one point toward another. */
export function headingOf(from: Point, to: Point): Point {
	return { x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y) };
}

/** The first multiple of `step` at or after `value`, such as the next line of a grid. */
export function roundUp(value: number, step: number): number {
	return Math.ceil(value / step) * step;
}

/** A horizontal or vertical segment. */
export type Segment = [Point, Point];

/** A box with each side moved outward. */
export function grown(box: Box, by: number): Box {
	return { x: box.x - by, y: box.y - by, width: box.width + 2 * by, height: box.height + 2 * by };
}

/** Whether two boxes overlap, more than along their borders. */
export function overlaps(a: Box, b: Box): boolean {
	return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Below this, a line that only grazes a box's border doesn't pass through it. */
const graze = 1e-6;

/** Whether a horizontal or vertical segment passes through a box, inside its border. */
export function crosses(box: Box, a: Point, b: Point): boolean {
	return (
		Math.min(a.x, b.x) < box.x + box.width - graze &&
		Math.max(a.x, b.x) > box.x + graze &&
		Math.min(a.y, b.y) < box.y + box.height - graze &&
		Math.max(a.y, b.y) > box.y + graze
	);
}

/** A box's four sides. */
export function sidesOf(box: Box): Segment[] {
	const corners = [
		{ x: box.x, y: box.y },
		{ x: box.x + box.width, y: box.y },
		{ x: box.x + box.width, y: box.y + box.height },
		{ x: box.x, y: box.y + box.height },
	];
	return corners.map((corner, index): Segment => [corner, corners[(index + 1) % 4] ?? corner]);
}
