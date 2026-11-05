/** Spatial Node selection, leaving other parts free to handle details and Walkthrough keys. */

import type { Point } from "../core/scene.ts";
import type { Part } from "./stage.ts";
import { type DrawnNode, modelOf, nodesInLayout } from "./svg.ts";

const directions: Record<string, Point> = {
	ArrowRight: { x: 1, y: 0 },
	ArrowLeft: { x: -1, y: 0 },
	ArrowDown: { x: 0, y: 1 },
	ArrowUp: { x: 0, y: -1 },
};

/** A sideways pixel costs four ahead, so the selection favors Nodes in line. */
const sideways = 4;

export const keyboard: Part = {
	css: `
[data-node][data-selected] {
	outline: 2px solid var(--theme-accent);
	outline-offset: 3px;
}
`,
	setUp({ element, camera, selection, onShow }) {
		element.setAttribute(
			"aria-description",
			"Use arrow keys to select a Node, Enter for details, and Escape to close them. Press Tab to read Nodes and Edges.",
		);
		onShow((svg) => {
			const model = modelOf(svg);
			if (model === undefined) {
				return undefined;
			}
			const nodes = nodesInLayout(svg, model);
			const mark = () => {
				for (const node of nodes) {
					const selected = selection.current?.kind === "node" && selection.current.id === node.id;
					node.element.toggleAttribute("data-selected", selected);
					const view = camera.view;
					if (selected && view !== undefined) {
						const margin = 16 / view.scale;
						const shift = (start: number, size: number, first: number, room: number) =>
							start < first + margin
								? start - first - margin
								: Math.max(0, start + size - first - room + margin);
						camera.move(
							{
								x: shift(node.box.x, node.box.width, view.x, view.width) * view.scale,
								y: shift(node.box.y, node.box.height, view.y, view.height) * view.scale,
							},
							{ x: 0, y: 0 },
						);
					}
				}
			};
			const unwatch = selection.watch(mark);
			mark();
			const events = new AbortController();
			const { signal } = events;
			element.addEventListener(
				"focus",
				() => {
					if (
						selection.current === undefined &&
						element.matches(":focus-visible") &&
						nodes[0] !== undefined
					) {
						selection.select({ kind: "node", id: nodes[0].id });
					}
				},
				{ signal },
			);
			element.addEventListener(
				"keydown",
				(event) => {
					if (
						event.target !== element ||
						event.defaultPrevented ||
						event.ctrlKey ||
						event.metaKey ||
						event.altKey
					) {
						return;
					}
					const direction = directions[event.key];
					if (direction === undefined) {
						return;
					}
					const current = nodes.find(
						({ id }) => selection.current?.kind === "node" && selection.current.id === id,
					);
					const target = current === undefined ? nodes[0] : nearest(nodes, current, direction);
					if (target !== undefined) {
						selection.select({ kind: "node", id: target.id });
					}
					event.preventDefault();
				},
				{ signal },
			);
			return () => {
				events.abort();
				unwatch();
				for (const node of nodes) {
					node.element.removeAttribute("data-selected");
				}
			};
		});
	},
};

function nearest(nodes: DrawnNode[], current: DrawnNode, direction: Point): DrawnNode | undefined {
	const center = (node: DrawnNode) => ({
		x: node.box.x + node.box.width / 2,
		y: node.box.y + node.box.height / 2,
	});
	const origin = center(current);
	let best = Number.POSITIVE_INFINITY;
	let chosen: DrawnNode | undefined;
	for (const node of nodes) {
		const point = center(node);
		const dx = point.x - origin.x;
		const dy = point.y - origin.y;
		const ahead = dx * direction.x + dy * direction.y;
		if (ahead <= 0) {
			continue;
		}
		const score = ahead + sideways * Math.abs(dx * direction.y - dy * direction.x);
		if (score < best) {
			best = score;
			chosen = node;
		}
	}
	return chosen;
}
