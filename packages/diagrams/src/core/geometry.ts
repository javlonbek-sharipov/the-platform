/** Plane geometry that layout, routing, the marks and the SVG writer share. */

import type { Point } from "./scene.ts";

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
