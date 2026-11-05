/** Glossary definitions beside the Nodes that link to them. */

import { termOf } from "../atlas/terms.ts";
import type { AnyNode } from "../authoring/model.ts";
import type { Part } from "./stage.ts";
import { modelOf } from "./svg.ts";
import { createTooltip } from "./tooltip.ts";

export const termTooltip: Part = {
	css: `.term-definition { white-space: pre-wrap; }`,
	setUp({ element, navigation, onShow }) {
		onShow((svg) => {
			const model = modelOf(svg);
			if (model === undefined) return undefined;
			let hovered: AnyNode | undefined;
			let pointer: PointerEvent | undefined;
			const {
				element: tooltip,
				signal,
				hide,
				position,
				remove,
			} = createTooltip(element, () => {
				hovered = undefined;
			});
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
				position(pointer);
			};
			const unwatch = navigation.watch(show);
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
						position(pointer);
					},
					{ signal },
				);
				drawn.addEventListener("pointerleave", hide, { signal });
			}
			return () => {
				unwatch();
				remove();
			};
		});
	},
};
