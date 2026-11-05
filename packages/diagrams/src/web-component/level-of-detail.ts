/**
 * The level of detail: as the view zooms out, Rows fade and then disappear,
 * leaving only the headers, so that an overview stays readable.
 */

import type { Part } from "./stage.ts";

/** The scale from which Rows show in full: Fit never goes below it, so Fit always shows them. */
const whole = 0.6;
/**
 * The scale at which Rows are gone, and stay gone further off: their 12 px
 * text would be drawn smaller than 5.4 px. Between the two, they fade.
 */
const gone = 0.45;

export const levelOfDetail: Part = {
	// A Row that has faded to nothing is hidden too, so that it can't be found or pressed.
	css: `
.stage {
	--row-opacity: 1;
	--row-visibility: visible;
}
[data-row] {
	opacity: var(--row-opacity);
	visibility: var(--row-visibility);
}
`,
	setUp({ element, camera }) {
		let shown = 1;
		camera.watch(({ scale }) => {
			const opacity = Math.min(Math.max((scale - gone) / (whole - gone), 0), 1);
			// Most new views only pan, and leave the Rows as they are.
			if (opacity !== shown) {
				shown = opacity;
				element.style.setProperty("--row-opacity", String(opacity));
				element.style.setProperty("--row-visibility", opacity === 0 ? "hidden" : "visible");
			}
		});
	},
};
