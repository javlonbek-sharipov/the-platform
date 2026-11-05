/** The host's motion policy, and flow within the reader's view. */

import type { Box } from "../core/scene.ts";
import { flowInView } from "./flow-path.ts";
import type { Part } from "./stage.ts";

/** Further out than the Rows disappear: the marks are no longer useful at this scale. */
const gone = 0.35;

export const flow: Part = {
	css: `
:host([motion="off"]) *,
:host([motion="off"]) *::before,
:host([motion="off"]) *::after {
	animation: none !important;
	transition: none !important;
}
:host([motion="off"]) [data-flow] {
	display: none !important;
}
@media (prefers-reduced-motion: reduce) {
	*, *::before, *::after {
		animation: none !important;
		transition: none !important;
	}
}
`,
	setUp({ element, camera, onShow }) {
		let marks: { element: SVGPathElement; inView: (view: Box) => boolean }[] = [];
		let inSight = false;
		const update = () => {
			const view = camera.view;
			for (const { element: mark, inView } of marks) {
				const hidden = view === undefined || view.scale <= gone || !inView(view);
				if (hidden) {
					mark.style.display = "none";
				} else {
					mark.style.removeProperty("display");
				}
				if (inSight) {
					mark.style.removeProperty("animation-play-state");
				} else {
					mark.style.animationPlayState = "paused";
				}
			}
		};
		camera.watch(update);
		onShow((svg) => {
			marks = [...svg.querySelectorAll<SVGPathElement>("[data-flow]")].map((element) => ({
				element,
				inView: flowInView(element),
			}));
			inSight = false;
			let live = true;
			const visibility = new IntersectionObserver(([entry]) => {
				if (live && entry !== undefined) {
					inSight =
						entry.isIntersecting &&
						entry.intersectionRect.width > 0 &&
						entry.intersectionRect.height > 0;
					update();
				}
			});
			visibility.observe(element);
			update();
			return () => {
				live = false;
				visibility.disconnect();
				for (const { element: mark } of marks) {
					mark.style.removeProperty("display");
					mark.style.removeProperty("animation-play-state");
				}
				marks = [];
			};
		});
	},
};
