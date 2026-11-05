/**
 * The stage's name. The stage takes the keyboard's focus, so a reader who
 * can't see it hears what it is: a group, named by its Diagram's title, which
 * is the SVG's own.
 */

import type { Part } from "./stage.ts";

export const label: Part = {
	setUp({ element, onShow }) {
		element.setAttribute("role", "group");
		onShow((svg) => {
			const title = svg.querySelector(":scope > title")?.textContent?.trim();
			if (title === undefined || title === "") {
				element.removeAttribute("aria-label");
			} else {
				element.setAttribute("aria-label", title);
			}
			return undefined;
		});
	},
};
