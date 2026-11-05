/**
 * How a reader moves the camera: with the keys and the wheel, over the stage
 * that has the focus, by dragging the drawing, and by pinching it.
 */

import type { Point } from "../core/scene.ts";
import type { Camera, View } from "./camera.ts";
import type { Part } from "./stage.ts";

/** How much closer one press of `+` brings the drawing, and one of `−` takes it back. */
const step = 1.25;
/** How far a press must move, in pixels, before it's a drag. Short of that, it stays a click. */
const slop = 4;
/** The same for a finger, which is never as still as a mouse. */
const touchSlop = 10;
/**
 * How far the wheel turns, in pixels, to bring the drawing closer by e, about
 * 2.7 times. A notch of a mouse wheel is about 100, so it zooms by a fifth.
 */
const wheelTurn = 550;
/**
 * The same for a pinch on a trackpad, which browsers report as the wheel
 * turning with Ctrl held, a few pixels at a time: 100 follows the fingers.
 */
const pinchTurn = 100;
/** The most one turn of the wheel zooms, as a power of e: by about a quarter. */
const mostTurn = 0.25;
/** A turn counted in lines or in pages, as some mice report it, in pixels. */
const turnUnits = [1, 30, 300];

export const gestures: Part = {
	css: `
.stage {
	/* A finger on the stage moves the drawing, not the page. */
	touch-action: none;
	cursor: grab;
}
`,
	setUp({ element, camera }) {
		steer(element, camera);
	},
};

/** Lets the reader's input on the stage move the camera. */
function steer(stage: HTMLElement, camera: Camera): void {
	/** Where a pointer is on the stage, from the stage's top left corner. */
	const place = (event: MouseEvent): Point => {
		const { left, top } = stage.getBoundingClientRect();
		return { x: event.clientX - left, y: event.clientY - top };
	};

	stage.addEventListener("keydown", (event) => {
		// With these held, the keys are the browser's own, such as its zoom.
		if (
			event.target !== stage ||
			event.defaultPrevented ||
			event.ctrlKey ||
			event.metaKey ||
			event.altKey
		) {
			return;
		}
		// `=` is the `+` key without Shift.
		if (event.key === "+" || event.key === "=") {
			camera.zoom(step);
		} else if (event.key === "-") {
			camera.zoom(1 / step);
		} else if (event.key === "0") {
			camera.fit();
		} else {
			return;
		}
		event.preventDefault();
	});

	stage.addEventListener(
		"wheel",
		(event) => {
			// HTML controls and panels keep their own scrolling, including inside the stage.
			if (event.target !== stage && !(event.target instanceof SVGElement)) {
				return;
			}
			const pinch = event.ctrlKey || event.metaKey;
			// The wheel is the page's, to scroll with, until the Diagram has the focus.
			if (!pinch && !stage.matches(":focus-within")) {
				return;
			}
			event.preventDefault();
			const turn =
				(event.deltaY * (turnUnits[event.deltaMode] ?? 1)) / (pinch ? pinchTurn : wheelTurn);
			camera.zoom(Math.exp(-Math.min(Math.max(turn, -mostTurn), mostTurn)), place(event));
		},
		{ passive: false },
	);

	/** Each pointer that's down, by its id, and where it is on the stage. */
	const pointers = new Map<number, Point>();
	/**
	 * What the gesture counts from: where its pointers were, and the view
	 * then. It starts again whenever a pointer lands or lifts. Counting each
	 * move from there, not from the move before, means that two fingers, which
	 * report their moves one after the other, end where they'd end together.
	 */
	let origin: { pointers: [id: number, point: Point][]; view: View | undefined } | undefined;
	/** The view the gesture showed last. Any other means that something else moved the camera. */
	let shown: View | undefined;
	let dragging = false;
	const restart = () => {
		origin = { pointers: [...pointers], view: camera.view };
		shown = camera.view;
	};

	stage.addEventListener("pointerdown", (event) => {
		if (event.button !== 0 || (event.target !== stage && !(event.target instanceof SVGElement))) {
			return;
		}
		// A first pointer starts afresh. One still held here never lifted for the stage
		// to see: its lifting went to an element that had left the stage by then.
		if (event.isPrimary) {
			pointers.clear();
			dragging = false;
		}
		pointers.set(event.pointerId, place(event));
		restart();
		// A second finger makes the press a pinch at once: two fingers never click.
		if (pointers.size > 1) {
			dragging = true;
		}
	});
	stage.addEventListener("pointermove", (event) => {
		if (!pointers.has(event.pointerId)) {
			return;
		}
		// The wheel or a key may zoom while a pointer is down. The gesture goes on from there.
		if (dragging && camera.view !== shown) {
			restart();
		}
		const [first, second] = origin?.pointers ?? [];
		if (origin === undefined || first === undefined) {
			return;
		}
		const now = place(event);
		if (!dragging) {
			if (distance(first[1], now) < (event.pointerType === "touch" ? touchSlop : slop)) {
				return;
			}
			dragging = true;
			// The drag goes on wherever the pointer goes, off the stage too.
			stage.setPointerCapture(event.pointerId);
			stage.style.cursor = "grabbing";
		}
		pointers.set(event.pointerId, now);
		const one = pointers.get(first[0]) ?? first[1];
		if (second === undefined) {
			camera.move(first[1], one, 1, origin.view);
		} else {
			// Two fingers: the drawing follows the point between them, and grows as they spread.
			const other = pointers.get(second[0]) ?? second[1];
			const spread = distance(first[1], second[1]);
			camera.move(
				between(first[1], second[1]),
				between(one, other),
				spread > 0 ? distance(one, other) / spread : 1,
				origin.view,
			);
		}
		shown = camera.view;
	});
	const release = (event: PointerEvent) => {
		if (!pointers.delete(event.pointerId)) {
			return;
		}
		restart();
		if (pointers.size === 0) {
			if (dragging) {
				swallowClick();
			}
			dragging = false;
			stage.style.cursor = "";
		}
	};
	stage.addEventListener("pointerup", release);
	stage.addEventListener("pointercancel", release);
	// A press that moves pans the drawing, so it never selects the text it passes.
	stage.addEventListener("selectstart", (event) => {
		const target = event.target;
		if (
			target === stage ||
			target instanceof SVGElement ||
			(target instanceof Node && target.parentElement instanceof SVGElement)
		) {
			event.preventDefault();
		}
	});
}

function distance(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

function between(a: Point, b: Point): Point {
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Keeps the click that the browser makes of a drag's press and release from
 * anything that listens for clicks, the page included: a drag isn't a click.
 * The click comes straight after the release, if it comes at all.
 */
function swallowClick(): void {
	const swallow = (event: Event) => {
		event.stopImmediatePropagation();
		event.preventDefault();
	};
	window.addEventListener("click", swallow, { capture: true, once: true });
	setTimeout(() => window.removeEventListener("click", swallow, { capture: true }));
}
