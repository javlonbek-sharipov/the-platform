/** A Node's upstream and downstream dependencies, shown at full strength. */

import { type AnyDiagram, endNode, parentsOf } from "../authoring/model.ts";
import { definitionOf, type Notation } from "../notations/notation.ts";
import { notations } from "../notations/notations.ts";
import type { SelectionTarget } from "./selection.ts";
import type { Part } from "./stage.ts";
import { modelOf } from "./svg.ts";

export const focus: Part = {
	css: `
[data-node], [data-group], [data-edge], [data-edge-label], [data-edge-role], [data-from]:not([data-edge]) {
	opacity: var(--focus-opacity, 1);
	transition: opacity 180ms ease;
}
`,
	setUp({ element, selection, highlights, onShow }) {
		onShow((svg) => {
			const diagram = modelOf(svg);
			if (diagram === undefined) {
				return undefined;
			}
			const notation = notations.find(({ name }) => name === diagram.notation);
			if (notation === undefined) {
				return undefined;
			}
			selection.show(diagram);
			const nodes = [...svg.querySelectorAll<SVGGElement>("[data-node]")];
			const edges = [
				...svg.querySelectorAll<SVGGElement>("[data-edge], [data-edge-label], [data-edge-role]"),
			];
			const groups = [...svg.querySelectorAll<SVGGElement>("[data-group]")];
			const junctions = [...svg.querySelectorAll<SVGElement>("[data-from]:not([data-edge])")];
			const parents = parentsOf(diagram);
			let hovered: SelectionTarget | undefined;
			const show = () => {
				const target = hovered ?? selection.current;
				const edge = diagram.edges.find(({ id }) => target?.kind === "edge" && id === target.id);
				const kept =
					highlights.current ??
					(target === undefined
						? undefined
						: edge === undefined
							? dependenciesOf(diagram, notation, target.id)
							: {
									nodes: new Set([endNode(edge.from), endNode(edge.to)]),
									edges: new Set([edge.id]),
								});
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
				const keptGroups = new Set<string>();
				for (const node of kept?.nodes ?? []) {
					let parent = parents.get(node);
					while (parent !== undefined) {
						keptGroups.add(parent);
						parent = parents.get(parent);
					}
				}
				for (const group of groups) {
					group.style.setProperty(
						"--focus-opacity",
						kept === undefined || keptGroups.has(group.dataset.group ?? "") ? "1" : "0.2",
					);
				}
				for (const junction of junctions) {
					const active =
						kept === undefined ||
						diagram.edges.some(
							(edge) =>
								kept.edges.has(edge.id) &&
								endNode(edge.from) === junction.dataset.from &&
								(typeof edge.from === "string" ? undefined : edge.from.row) ===
									junction.dataset.fromRow,
						);
					junction.style.setProperty("--focus-opacity", active ? "1" : "0.2");
				}
			};
			const events = new AbortController();
			const { signal } = events;
			const hits: SVGPathElement[] = [];
			for (const node of nodes) {
				const target: SelectionTarget = { kind: "node", id: node.dataset.node ?? "" };
				node.addEventListener(
					"pointerenter",
					() => {
						hovered = target;
						show();
					},
					{ signal },
				);
				node.addEventListener(
					"pointerleave",
					() => {
						hovered = undefined;
						show();
					},
					{ signal },
				);
				node.addEventListener(
					"click",
					() => {
						element.focus({ preventScroll: true });
						selection.select(target);
					},
					{ signal },
				);
			}
			for (const part of edges) {
				if (part.dataset.edge !== undefined) {
					const path = part.querySelector("path");
					if (path !== null) {
						const hit = path.cloneNode(false) as SVGPathElement;
						hit.removeAttribute("class");
						hit.removeAttribute("stroke-dasharray");
						hit.setAttribute("stroke", "transparent");
						hit.setAttribute("stroke-width", "12");
						hit.setAttribute("fill", "none");
						hit.setAttribute("pointer-events", "stroke");
						hit.setAttribute("vector-effect", "non-scaling-stroke");
						part.append(hit);
						hits.push(hit);
					}
				}
				const id = part.dataset.edge ?? part.dataset.edgeLabel ?? part.dataset.edgeRole ?? "";
				part.addEventListener(
					"pointerenter",
					() => {
						hovered = { kind: "edge", id };
						show();
					},
					{ signal },
				);
				part.addEventListener(
					"pointerleave",
					() => {
						hovered = undefined;
						show();
					},
					{ signal },
				);
			}
			const unwatch = selection.watch(() => {
				hovered = undefined;
				show();
			});
			const unhighlight = highlights.watch(show);
			show();
			element.addEventListener(
				"keydown",
				(event) => {
					if (event.key === "Escape" && !event.defaultPrevented) {
						hovered = undefined;
						highlights.set(undefined);
						selection.select(undefined);
						show();
						event.preventDefault();
					}
				},
				{ signal },
			);
			return () => {
				events.abort();
				unwatch();
				unhighlight();
				for (const hit of hits) {
					hit.remove();
				}
				for (const part of [...nodes, ...edges, ...groups, ...junctions]) {
					part.style.removeProperty("--focus-opacity");
				}
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
