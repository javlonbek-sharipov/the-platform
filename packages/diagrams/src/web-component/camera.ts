/**
 * The camera: which part of a drawing the stage shows, and how large. It
 * holds no element. It's told the drawing's bounds and the stage's size, and
 * tells whoever watches it each new view.
 */

import type { Box } from "../core/scene.ts";

/**
 * What the stage shows: the part of the drawing in view, and how many of the
 * stage's pixels each of the drawing's takes.
 */
export interface View extends Box {
	scale: number;
}

export interface Size {
	width: number;
	height: number;
}

/** The room Fit leaves between the drawing and each side of the stage, in the stage's pixels. */
const padding = 16;
/**
 * The smallest scale Fit chooses. Below it, text gets hard to read: a Row's
 * 12 px text would be drawn smaller than about 8 px.
 */
const readable = 0.7;
/** The scale at which the drawing is as large as its SVG draws it. Fit never enlarges it. */
const natural = 1;

export class Camera {
	#bounds: Box | undefined;
	#size: Size = { width: 0, height: 0 };
	#view: View | undefined;
	readonly #watchers = new Set<(view: View) => void>();

	/** What the stage shows now, once there's a drawing and the stage has a size. */
	get view(): View | undefined {
		return this.#view;
	}

	/** Calls back with each new view. */
	watch(watcher: (view: View) => void): void {
		this.#watchers.add(watcher);
	}

	/** Turns to a drawing with these bounds, and fits it. */
	frame(bounds: Box): void {
		this.#bounds = bounds;
		this.fit();
	}

	/** Follows the stage's size. */
	resize(size: Size): void {
		this.#size = size;
		this.fit();
	}

	/**
	 * Frames the drawing, with some padding: whole and in the middle where it
	 * fits, at its natural size at most. It never makes the drawing so small
	 * that its text is hard to read: a drawing too large for that starts at its
	 * left or its top, where its sources are, whichever its direction.
	 */
	fit(): void {
		const bounds = this.#bounds;
		const { width, height } = this.#size;
		if (bounds === undefined || width <= 0 || height <= 0) {
			return;
		}
		const whole = Math.min(
			(width - 2 * padding) / bounds.width,
			(height - 2 * padding) / bounds.height,
		);
		const scale = Math.min(Math.max(whole, readable), natural);
		this.#show(
			startOf(bounds.x, bounds.width, width, scale),
			startOf(bounds.y, bounds.height, height, scale),
			scale,
		);
	}

	/** Shows the drawing from a point, which goes to the stage's top left corner, at a scale. */
	#show(x: number, y: number, scale: number): void {
		const { width, height } = this.#size;
		const view = { x, y, width: width / scale, height: height / scale, scale };
		this.#view = view;
		for (const watcher of this.#watchers) {
			watcher(view);
		}
	}
}

/**
 * Where the view starts along one axis, to show a stretch of the drawing in
 * a room of the stage: in the middle of the room if the stretch fits in it,
 * and with the stretch's start one padding in if it doesn't.
 */
function startOf(start: number, length: number, room: number, scale: number): number {
	const spare = room - length * scale;
	return start - Math.max(spare / 2, padding) / scale;
}
