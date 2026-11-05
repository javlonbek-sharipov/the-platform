/**
 * How a reader moves the camera, with the keys, over the stage that has the
 * focus.
 */

import type { Camera } from "./camera.ts";

/** How much closer one press of `+` brings the drawing, and one of `−` takes it back. */
const step = 1.25;

/** Lets the reader's input on the stage move the camera. */
export function steer(stage: HTMLElement, camera: Camera): void {
	stage.addEventListener("keydown", (event) => {
		// With these held, the keys are the browser's own, such as its zoom.
		if (event.ctrlKey || event.metaKey || event.altKey) {
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
}
