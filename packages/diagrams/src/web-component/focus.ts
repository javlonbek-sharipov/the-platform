/** A Node's upstream and downstream dependencies, shown at full strength. */

import { type AnyDiagram, endNode } from "../authoring/model.ts";
import { definitionOf, type Notation } from "../notations/notation.ts";
import { notations } from "../notations/notations.ts";
import type { Part } from "./stage.ts";

export const focus: Part = {
	css: `
[data-node], [data-edge], [data-edge-label], [data-edge-role] {
	opacity: var(--focus-opacity, 1);
}
`,
	setUp({ element, onShow }) {
		onShow((svg) => {
			const text = svg.querySelector(":scope > metadata")?.textContent;
			if (!text) {
				return undefined;
			}
			const diagram: AnyDiagram = JSON.parse(text);
			const notation = notations.find(({ name }) => name === diagram.notation);
			if (notation === undefined) {
				return undefined;
			}
			const nodes = [...svg.querySelectorAll<SVGGElement>("[data-node]")];
			const edges = [
				...svg.querySelectorAll<SVGGElement>("[data-edge], [data-edge-label], [data-edge-role]"),
			];
			const show = (id: string | undefined) => {
				const kept = id === undefined ? undefined : dependenciesOf(diagram, notation, id);
				for (const node of nodes) {
					node.style.setProperty(
						"--focus-opacity",
						kept?.nodes.has(node.dataset.node ?? "") === false ? "0.2" : "1",
					);
				}
				for (const edge of edges) {
					edge.style.setProperty(
						"--focus-opacity",
						kept?.edges.has(
							edge.dataset.edge ?? edge.dataset.edgeLabel ?? edge.dataset.edgeRole ?? "",
						) === false
							? "0.2"
							: "1",
					);
				}
			};
			const events = new AbortController();
			const { signal } = events;
			for (const node of nodes) {
				node.addEventListener("pointerenter", () => show(node.dataset.node), { signal });
				node.addEventListener("pointerleave", () => show(undefined), { signal });
			}
			element.addEventListener(
				"keydown",
				(event) => {
					if (event.key === "Escape" && !event.defaultPrevented) {
						show(undefined);
						event.preventDefault();
					}
				},
				{ signal },
			);
			return () => {
				events.abort();
				show(undefined);
			};
		});
	},
};

/** Each walk follows one direction throughout, so branches off an ancestor stay faded. */
function dependenciesOf(
	diagram: AnyDiagram,
	notation: Notation,
	id: string,
): { nodes: Set<string>; edges: Set<string> } {
	const nodes = new Set([id]);
	const edges = new Set<string>();
	for (const [from, to] of [
		["from", "to"],
		["to", "from"],
	] as const) {
		const visited = new Set([id]);
		for (const current of visited) {
			for (const edge of diagram.edges) {
				const next =
					endNode(edge[from]) === current
						? endNode(edge[to])
						: definitionOf(notation.edgeKinds, edge.kind).symmetric === true &&
								endNode(edge[to]) === current
							? endNode(edge[from])
							: undefined;
				if (next !== undefined) {
					visited.add(next);
					nodes.add(next);
					edges.add(edge.id);
				}
			}
		}
	}
	return { nodes, edges };
}
