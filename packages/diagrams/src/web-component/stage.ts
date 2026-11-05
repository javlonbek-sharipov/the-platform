/**
 * The stage, and the parts that work on it. The component is built of parts,
 * such as the gestures and the level of detail. Each one is a module of its
 * own, which the component sets up on its stage, so that a new part adds a
 * module and one line to the list in `parts.ts`.
 */

import type { Camera } from "./camera.ts";
import type { Highlights } from "./highlights.ts";
import type { Navigation } from "./navigation.ts";
import type { Selection } from "./selection.ts";

/** What the component gives each of its parts to work with. */
export interface Stage {
	/**
	 * The element that holds the Diagram's SVG and clips it. It takes the
	 * focus and gets the reader's input, and it stays while one SVG takes the
	 * place of another.
	 */
	readonly element: HTMLElement;
	/** Which part of the drawing the stage shows, and how large. */
	readonly camera: Camera;
	/** The Node or Edge selected by the reader or the host. Hover never changes it. */
	readonly selection: Selection;
	/** Explicit emphasis takes precedence over hover and selection, without replacing either. */
	readonly highlights: Highlights;
	/** Host metadata and navigation intents, without a dependency on the Node Atlas runtime. */
	readonly navigation: Navigation;
	/**
	 * Calls back with each Diagram's SVG when it's shown: put on the stage of a
	 * component that's in a page, or already on the stage when the component
	 * joins one. The callback may return a function, which is called when that
	 * ends: another SVG takes its place, or the component leaves the page.
	 */
	onShow(listener: Shown): void;
}

export type Shown = (svg: SVGSVGElement) => (() => void) | undefined;

export interface Part {
	/** The part's rules for the component's style sheet, which only reaches the component's shadow root. */
	readonly css?: string;
	/** Sets the part up on a component's stage, once, when the component is made. */
	setUp(stage: Stage): void;
}
