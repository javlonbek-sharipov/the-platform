/** Full Edge text on hover, including text shortened in the drawing. */

import { technologyOf } from "../core/technology.ts";
import { collapseSpaces } from "../core/text.ts";
import type { Part } from "./stage.ts";
import { modelOf } from "./svg.ts";

export const edgeTooltip: Part = {
	css: `
[role="tooltip"] {
	position: absolute;
	z-index: 1;
	max-width: min(32rem, calc(100% - 32px));
	box-sizing: border-box;
	padding: 8px 12px;
	border: 1px solid var(--theme-border);
	border-radius: 4px;
	background: var(--theme-surface);
	color: var(--theme-ink);
	font: 13px / 1.5 Helvetica, Arial, sans-serif;
	overflow-wrap: anywhere;
	pointer-events: none;
}
`,
	setUp({ element, onShow }) {
		onShow((svg) => {
			const diagram = modelOf(svg);
			if (diagram === undefined) {
				return undefined;
			}
			const tooltip = document.createElement("div");
			tooltip.setAttribute("role", "tooltip");
			tooltip.hidden = true;
			element.append(tooltip);
			const events = new AbortController();
			const { signal } = events;
			const hide = () => {
				tooltip.hidden = true;
			};
			const position = (event: PointerEvent) => {
				const frame = element.getBoundingClientRect();
				const { width, height } = tooltip.getBoundingClientRect();
				tooltip.style.left = `${Math.max(8, Math.min(event.clientX - frame.left + 12, frame.width - width - 8))}px`;
				tooltip.style.top = `${Math.max(8, Math.min(event.clientY - frame.top + 12, frame.height - height - 8))}px`;
			};
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
			element.addEventListener(
				"keydown",
				(event) => {
					if (event.key === "Escape") {
						hide();
					}
				},
				{ signal },
			);
			return () => {
				events.abort();
				tooltip.remove();
			};
		});
	},
};
