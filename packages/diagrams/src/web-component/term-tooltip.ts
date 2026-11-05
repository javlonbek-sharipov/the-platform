/** Glossary definitions beside the Nodes that link to them. */

import { termOf } from "../atlas/terms.ts";
import type { AnyNode } from "../authoring/model.ts";
import type { Part } from "./stage.ts";
import { modelOf } from "./svg.ts";

export const termTooltip: Part = {
	css: `.term-definition { white-space: pre-wrap; }`,
	setUp({ element, navigation, onShow }) {
		onShow((svg) => {
			const model = modelOf(svg);
			if (model === undefined) return undefined;
			const tooltip = document.createElement("div");
			tooltip.setAttribute("role", "tooltip");
			tooltip.hidden = true;
			element.append(tooltip);
			let hovered: AnyNode | undefined;
			let pointer: PointerEvent | undefined;
			const position = () => {
				if (pointer === undefined) return;
				const frame = element.getBoundingClientRect();
				const { width, height } = tooltip.getBoundingClientRect();
				tooltip.style.left = `${Math.max(8, Math.min(pointer.clientX - frame.left + 12, frame.width - width - 8))}px`;
				tooltip.style.top = `${Math.max(8, Math.min(pointer.clientY - frame.top + 12, frame.height - height - 8))}px`;
			};
			const hide = () => {
				hovered = undefined;
				tooltip.hidden = true;
			};
			const show = () => {
				const context = hovered === undefined ? undefined : navigation.contextOf(model, hovered.id);
				const terms = new Set(
					(hovered?.links ?? []).flatMap((link) => {
						const term =
							link.term === undefined
								? undefined
								: termOf(navigation.index?.terms ?? [], link, context);
						return term === undefined ? [] : [term];
					}),
				);
				tooltip.replaceChildren();
				for (const term of terms) {
					const title = document.createElement("strong");
					title.textContent = term.term;
					const definition = document.createElement("div");
					definition.className = "term-definition";
					definition.textContent = term.definition;
					tooltip.append(title, definition);
				}
				tooltip.hidden = terms.size === 0;
				position();
			};
			const unwatch = navigation.watch(show);
			const events = new AbortController();
			const { signal } = events;
			for (const drawn of svg.querySelectorAll<SVGGElement>("[data-node]")) {
				const node = model.nodes.find(({ id }) => id === drawn.dataset.node);
				if (!node?.links?.some((link) => link.term !== undefined)) continue;
				drawn.addEventListener(
					"pointerenter",
					(event) => {
						hovered = node;
						pointer = event;
						show();
					},
					{ signal },
				);
				drawn.addEventListener(
					"pointermove",
					(event) => {
						pointer = event;
						position();
					},
					{ signal },
				);
				drawn.addEventListener("pointerleave", hide, { signal });
			}
			element.addEventListener(
				"keydown",
				(event) => {
					if (event.key === "Escape") hide();
				},
				{ signal },
			);
			return () => {
				events.abort();
				unwatch();
				tooltip.remove();
			};
		});
	},
};
