/** Full Edge text on hover, including text shortened in the drawing. */

import { technologyOf } from "../core/technology.ts";
import { collapseSpaces } from "../core/text.ts";
import type { Part } from "./stage.ts";
import { modelOf } from "./svg.ts";
import { createTooltip } from "./tooltip.ts";

export const edgeTooltip: Part = {
	setUp({ element, onShow }) {
		onShow((svg) => {
			const diagram = modelOf(svg);
			if (diagram === undefined) {
				return undefined;
			}
			const { element: tooltip, signal, hide, position, remove } = createTooltip(element);
			for (const part of svg.querySelectorAll<SVGGElement>(
				"[data-edge], [data-edge-label], [data-edge-role]",
			)) {
				const id = part.dataset.edge ?? part.dataset.edgeLabel ?? part.dataset.edgeRole;
				const edge = diagram.edges.find((edge) => edge.id === id);
				if (edge === undefined) {
					continue;
				}
				part.addEventListener(
					"pointerenter",
					(event) => {
						const lines = [
							edge.label === undefined ? undefined : collapseSpaces(edge.label),
							[
								edge.technology === undefined ? undefined : technologyOf(edge.technology).name,
								edge.rate,
							]
								.filter((value) => value !== undefined)
								.join(" · "),
						];
						tooltip.replaceChildren(
							...lines
								.filter((text) => text !== undefined && text !== "")
								.map((text) => {
									const line = document.createElement("div");
									line.textContent = text ?? "";
									return line;
								}),
						);
						tooltip.hidden = tooltip.childElementCount === 0;
						position(event);
					},
					{ signal },
				);
				part.addEventListener("pointermove", position, { signal });
				part.addEventListener("pointerleave", hide, { signal });
			}
			return remove;
		});
	},
};
