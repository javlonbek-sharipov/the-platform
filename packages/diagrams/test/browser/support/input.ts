/**
 * A reader's input, as real events: the provider moves the browser's own
 * mouse and presses its own keys.
 */

import { cdp, userEvent } from "vitest/browser";
import type { Point } from "../../../src/index.ts";

/**
 * A point counted from an element's top left corner, as the browser's
 * window counts it: the tests' page is a frame in that window.
 */
function inWindow(element: Element, { x, y }: Point): Point {
	const frame = window.frameElement?.getBoundingClientRect() ?? { left: 0, top: 0 };
	const { left, top } = element.getBoundingClientRect();
	return { x: frame.left + left + x, y: frame.top + top + y };
}

/** The keys that may be held while the wheel turns, as the browser's own input counts them. */
const modifiers = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };

/**
 * Turns the mouse wheel over a point of an element, counted from the
 * element's top left corner: down by a positive distance, up by a negative
 * one, with a key held, if one is given.
 */
export async function wheel(
	element: Element,
	at: Point,
	distance: number,
	held?: keyof typeof modifiers,
): Promise<void> {
	await cdp().send("Input.dispatchMouseEvent", {
		type: "mouseWheel",
		...inWindow(element, at),
		deltaX: 0,
		deltaY: distance,
		modifiers: held === undefined ? 0 : modifiers[held],
	});
}

/**
 * A point counted from an element's top left corner, as one of the page's,
 * so that the mouse can go there even when it lies outside the element.
 */
function onPage(element: Element, { x, y }: Point) {
	const { left, top } = element.getBoundingClientRect();
	return {
		target: document.documentElement,
		coords: { x: left + x + window.scrollX, y: top + y + window.scrollY },
	};
}

/**
 * Presses the main mouse button at a point of an element, and moves the
 * mouse, still pressed, to each of the points that follow. Each point is
 * counted from the element's top left corner.
 */
export async function press(element: Element, from: Point, ...to: Point[]): Promise<void> {
	await userEvent.pointer([
		{ ...onPage(element, from), keys: "[MouseLeft>]" },
		...to.map((point) => onPage(element, point)),
	]);
}

/** Moves the mouse, pressed or not, to a point of an element, counted from its top left corner. */
export async function moveTo(element: Element, to: Point): Promise<void> {
	await userEvent.pointer(onPage(element, to));
}

/** Lets the main mouse button go, where the mouse is. */
export async function letGo(): Promise<void> {
	await userEvent.pointer("[/MouseLeft]");
}

/** Presses at a point of an element, moves through the points that follow, and lets go at the last. */
export async function drag(element: Element, from: Point, ...to: Point[]): Promise<void> {
	await press(element, from, ...to);
	await letGo();
}

/**
 * Touches the screen over an element, with one finger or more. Each step
 * says where every finger is then, counted from the element's top left
 * corner: the fingers land at the first, move through the rest, and lift
 * after the last. A finger that a step leaves out has lifted.
 */
export async function touch(element: Element, ...steps: Point[][]): Promise<void> {
	const session = cdp();
	for (const [index, fingers] of steps.entries()) {
		await session.send("Input.dispatchTouchEvent", {
			type: index === 0 ? "touchStart" : "touchMove",
			touchPoints: fingers.map((finger, id) => ({ ...inWindow(element, finger), id })),
		});
	}
	await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
