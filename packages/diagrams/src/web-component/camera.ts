/**
 * The camera: which part of a drawing the stage shows, and how large. It
 * holds no element. It's told the drawing's bounds and the stage's size, and
 * tells whoever watches it each new view.
 */

import type { Box, Point } from "../core/scene.ts";

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

/** The room the camera leaves between the drawing and each side of the stage, in the stage's pixels. */
const padding = 16;
/**
 * The smallest scale Fit chooses. Below it, text gets hard to read: a Row's
 * 12 px text would be drawn smaller than about 8 px.
 */
const readable = 0.7;
/** The scale at which the drawing is as large as its SVG draws it. Fit never enlarges it. */
const natural = 1;
/** The largest scale: close enough to look at one Node, and no closer. */
const closest = 4;
/** The scale a stage with no room for a drawing still gets, so that a view always has one. */
const smallest = 0.01;

export class Camera {
	#bounds: Box | undefined;
	#size: Size = { width: 0, height: 0 };
	#view: View | undefined;
	/** Whether the view is Fit's, which follows the stage's size, rather than one the reader chose. */
	#fitted = true;
	readonly #watchers = new Set<(view: View) => void>();

	/** What the stage shows now, once there's a drawing and the stage has a size. */
	get view(): View | undefined {
		return this.#view;
	}

	/** Calls back with each new view. */
	watch(watcher: (view: View) => void): void {
		this.#watchers.add(watcher);
	}

	/**
	 * Turns to a drawing with these bounds, and fits it. Its view is a new one,
	 * even if it's the same as the last drawing's.
	 */
	frame(bounds: Box): void {
		this.#bounds = bounds;
		this.#view = undefined;
		this.fit();
	}

	/**
	 * Follows the stage's size. Fit's view is fitted again. A view the reader
	 * chose keeps its scale and its top left corner, where its limits still
	 * allow.
	 */
	resize(size: Size): void {
		this.#size = size;
		if (this.#fitted) {
			this.fit();
		} else {
			this.zoom(1, { x: 0, y: 0 });
		}
	}

	/**
	 * Frames the drawing, with some padding: whole and in the middle where it
	 * fits, at its natural size at most. It never makes the drawing so small
	 * that its text is hard to read: a drawing too large for that starts at its
	 * left or its top, where its sources are, whichever its direction.
	 */
	fit(): void {
		const whole = this.#whole();
		if (whole !== undefined) {
			const scale = Math.min(Math.max(whole, readable), natural);
			this.#show(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, scale);
		}
		this.#fitted = true;
	}

	/**
	 * Brings the drawing closer by a factor, or takes it further off by a
	 * factor below 1, within limits: no closer than is any use, and no further
	 * off than shows the whole drawing, or than Fit goes when that's further.
	 * The drawing's point at a point of the stage stays there where the view's
	 * limits allow: at the stage's middle, unless another is given.
	 */
	zoom(factor: number, about?: Point): void {
		const point = about ?? { x: this.#size.width / 2, y: this.#size.height / 2 };
		this.move(point, point, factor);
	}

	/**
	 * Moves the drawing: its point that a view showed at one point of the stage
	 * goes to another, and it gets a factor larger than the view showed it, all
	 * within the limits. The view is the one now, unless an earlier one is
	 * given: a gesture counts from the view it started with, so that its moves
	 * add up to no more than its fingers did.
	 */
	move(from: Point, to: Point, factor = 1, since: View | undefined = this.#view): void {
		const whole = this.#whole();
		if (since === undefined || whole === undefined) {
			return;
		}
		const furthest = Math.min(whole, readable);
		const scale = Math.min(Math.max(since.scale * factor, furthest), closest);
		const before = this.#view;
		this.#show(
			since.x + from.x / since.scale - to.x / scale,
			since.y + from.y / since.scale - to.y / scale,
			scale,
		);
		// A move that the limits brought to nothing leaves Fit's view Fit's.
		if (this.#view !== before) {
			this.#fitted = false;
		}
	}

	/** The scale at which the whole drawing just fits the stage, inside the padding. */
	#whole(): number | undefined {
		const bounds = this.#bounds;
		const { width, height } = this.#size;
		if (bounds === undefined || width <= 0 || height <= 0) {
			return undefined;
		}
		return Math.max(
			smallest,
			Math.min((width - 2 * padding) / bounds.width, (height - 2 * padding) / bounds.height),
		);
	}

	/**
	 * Shows the drawing at a scale, from as near a point as the view's limits
	 * allow: the point would go to the stage's top left corner. A view no
	 * different from the one before is no new view, and nobody is told of it.
	 */
	#show(x: number, y: number, scale: number): void {
		const bounds = this.#bounds;
		if (bounds === undefined) {
			return;
		}
		const { width, height } = this.#size;
		const before = this.#view;
		const view = {
			x: placed(bounds.x, bounds.width, width, scale, x),
			y: placed(bounds.y, bounds.height, height, scale, y),
			width: width / scale,
			height: height / scale,
			scale,
		};
		if (
			before !== undefined &&
			before.x === view.x &&
			before.y === view.y &&
			before.width === view.width &&
			before.height === view.height
		) {
			return;
		}
		this.#view = view;
		for (const watcher of this.#watchers) {
			watcher(view);
		}
	}
}

/**
 * The height, as a CSS length, of a stage that hugs a drawing as Fit frames
 * it, in a stage as wide as its container: `100cqw`. The drawing takes the
 * width left between the paddings, at a scale from the smallest that reads to
 * its natural size, and the stage is as high as the drawing is then, with
 * its paddings.
 */
export function huggingHeight(bounds: Box): string {
	const least = bounds.height * readable;
	const most = bounds.height * natural;
	const across = `(100cqw - ${2 * padding}px) * ${bounds.height / bounds.width}`;
	return `calc(clamp(${least}px, ${across}, ${most}px) + ${2 * padding}px)`;
}

/**
 * Where the view starts along one axis, to show a stretch of the drawing in
 * a room of the stage, at a scale. A stretch that fits in the room, inside the
 * paddings, sits in the middle of it. A longer one starts as near the wanted
 * start as keeps both its ends out at the paddings or beyond, so that the
 * stage never shows more empty room than a padding beside it.
 */
function placed(
	start: number,
	length: number,
	room: number,
	scale: number,
	wanted: number,
): number {
	const spare = room - length * scale;
	if (spare >= 2 * padding) {
		return start - spare / 2 / scale;
	}
	const first = start - padding / scale;
	const last = start + length - (room - padding) / scale;
	return Math.min(Math.max(wanted, first), last);
}
