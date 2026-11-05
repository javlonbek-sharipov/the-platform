/**
 * Looking at a Diagram as a reader does: where its texts are on the screen,
 * how large they're drawn, and where that puts the rest of its drawing.
 */

import { page } from "vitest/browser";
import type { Box, Point, Scene } from "../../../src/index.ts";

/** A box on the screen, in the page's CSS pixels. */
export interface ScreenBox {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/**
 * Each element that draws exactly this text in a Diagram, in the order
 * they're drawn. An element that the page doesn't render draws nothing.
 */
export function textsOf(diagram: Element, text: string): SVGGraphicsElement[] {
	return page
		.elementLocator(diagram)
		.getByText(text, { exact: true })
		.elements()
		.filter((element): element is SVGGraphicsElement => element instanceof SVGGraphicsElement)
		.filter((element) => element.checkVisibility());
}

/** The element that draws a text which a Diagram shows once. */
export function textOf(diagram: Element, text: string): SVGGraphicsElement {
	const [found, ...others] = textsOf(diagram, text);
	if (found === undefined || others.length > 0) {
		throw new Error(`expected the Diagram to draw "${text}" once, not ${others.length + 1} times`);
	}
	return found;
}

/** How the view shows a drawing: its scale, and where the scene's points and boxes lie on the screen. */
export interface View {
	/** Screen pixels for each of the drawing's own. */
	scale: number;
	/** Where a point of the drawing is on the screen. */
	point(point: Point): Point;
	/** The point of the drawing that's at a point of the screen. */
	at(point: Point): Point;
	box(box: Box): ScreenBox;
	/** The bounds of the whole drawing. */
	bounds: ScreenBox;
}

/**
 * Finds the view by looking at one text: how wide the browser draws it on
 * the screen, against how wide it is in the drawing, and where it sits.
 */
export function viewOf(diagram: Element, scene: Scene): View {
	const title = scene.nodes[0]?.title.text;
	if (title === undefined) {
		throw new Error("the scene has no Node to look for");
	}
	const text = textOf(diagram, title);
	const seen = text.getBoundingClientRect();
	const drawn = text.getBBox();
	const scale = seen.width / drawn.width;
	const point = ({ x, y }: Point): Point => ({
		x: seen.left + (x - drawn.x) * scale,
		y: seen.top + (y - drawn.y) * scale,
	});
	const box = ({ x, y, width, height }: Box): ScreenBox => {
		const corner = point({ x, y });
		const opposite = point({ x: x + width, y: y + height });
		return { left: corner.x, top: corner.y, right: opposite.x, bottom: opposite.y };
	};
	const at = ({ x, y }: Point): Point => ({
		x: drawn.x + (x - seen.left) / scale,
		y: drawn.y + (y - seen.top) / scale,
	});
	return { scale, point, at, box, bounds: box(scene.bounds) };
}

/** The middle of an element's box on the screen. */
export function middleOf(element: Element): Point {
	const { left, top, right, bottom } = element.getBoundingClientRect();
	return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

/** How far a box lies inside a frame, on each side. Negative where it sticks out. */
export function gapsOf(inner: ScreenBox, frame: ScreenBox): ScreenBox {
	return {
		left: inner.left - frame.left,
		top: inner.top - frame.top,
		right: frame.right - inner.right,
		bottom: frame.bottom - inner.bottom,
	};
}

/**
 * How strongly an element shows, from 0 to 1: its own opacity and that of
 * everything around it, out to the page, since each one fades what it holds.
 */
export function opacityOf(element: Element): number {
	let opacity = 1;
	let node: Node | null = element;
	while (node !== null) {
		if (node instanceof Element) {
			opacity *= Number(getComputedStyle(node).opacity);
		}
		node = node instanceof ShadowRoot ? node.host : node.parentNode;
	}
	return opacity;
}

/** Whether a reader can see an element: it's rendered, not hidden, and not faded to nothing. */
export function isSeen(element: Element): boolean {
	return element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
}
