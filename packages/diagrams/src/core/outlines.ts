/**
 * The outlines a Kind's look can take. Each one is drawn inside its Node's
 * rectangle, and leaves the header band free for the badge and the title.
 */

export type Outline =
	| "figure"
	| "heavy"
	| "window"
	| "hexagon"
	| "rounded"
	| "stack"
	| "chamfer"
	| "cylinder"
	| "chip"
	| "pipe"
	| "page"
	| "pill";

/** What layout needs to know of an outline. */
export interface OutlineFrame {
	/** The room above the header band, such as for a person's head. */
	headRoom: number;
	/** How far the outline's face starts in from each side, beyond the header's padding. */
	inset: { left: number; right: number };
}

const plain: OutlineFrame = { headRoom: 0, inset: { left: 0, right: 0 } };

export const outlineFrames: Record<Outline, OutlineFrame> = {
	figure: { ...plain, headRoom: 32 },
	heavy: plain,
	window: plain,
	hexagon: plain,
	rounded: plain,
	stack: plain,
	chamfer: plain,
	cylinder: plain,
	chip: plain,
	// The pipe's open end faces right.
	pipe: { ...plain, inset: { left: 0, right: 18 } },
	page: plain,
	pill: plain,
};
