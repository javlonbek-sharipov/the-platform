/** A text alternative alongside the drawing, in the order its layout reads. */

import { endNode } from "../authoring/model.ts";
import { nodeDescriptionOf, sentenceOf } from "../core/description.ts";
import { collapseSpaces } from "../core/text.ts";
import { notations } from "../notations/notations.ts";
import type { SelectionTarget } from "./selection.ts";
import type { Part } from "./stage.ts";
import { modelOf, nodesInLayout } from "./svg.ts";

export const readerLists: Part = {
	css: `
.reader-lists, .reader-status {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;
}
.reader-lists:focus-within {
	width: auto;
	height: auto;
	max-height: calc(100% - 16px);
	inset: 8px 8px auto;
	z-index: 2;
	box-sizing: border-box;
	margin: 0;
	padding: 8px 12px;
	overflow: auto;
	clip-path: none;
	white-space: normal;
	background: var(--theme-surface);
	color: var(--theme-ink);
	border: 1px solid var(--theme-border);
	border-radius: 4px;
	font: 14px / 1.5 Helvetica, Arial, sans-serif;
}
.reader-lists button {
	font: inherit;
	color: inherit;
	background: transparent;
	border: 0;
	padding: 4px;
	text-align: start;
}
.reader-lists button:focus-visible {
	outline: 2px solid var(--theme-accent);
}
`,
	setUp({ element, selection, onShow }) {
		let focused: SelectionTarget | undefined;
		onShow((svg) => {
			const restore = focused;
			focused = undefined;
			const model = modelOf(svg);
			const notation = notations.find(({ name }) => name === model?.notation);
			if (model === undefined || notation === undefined) {
				return undefined;
			}
			const holder = document.createElement("div");
			holder.className = "reader-lists";
			holder.dataset.readerLists = "";
			const buttons: { target: SelectionTarget; button: HTMLButtonElement }[] = [];
			const bind = (button: HTMLButtonElement, target: SelectionTarget) => {
				button.addEventListener("focus", () => selection.select(target));
				button.addEventListener("click", () => selection.select(target));
				buttons.push({ target, button });
			};
			const list = document.createElement("ol");
			list.setAttribute("aria-label", "Nodes");
			const nodes = nodesInLayout(svg, model);
			for (const drawn of nodes) {
				const node = model.nodes.find(({ id }) => id === drawn.id);
				if (node === undefined) {
					continue;
				}
				const item = document.createElement("li");
				const button = document.createElement("button");
				button.type = "button";
				button.dataset.nodeItem = node.id;
				const rows = (node.rows ?? []).map(({ name, value }) =>
					value ? `${collapseSpaces(name)}: ${collapseSpaces(value)}` : collapseSpaces(name),
				);
				button.textContent = `${nodeDescriptionOf(node, notation)}.${rows.length === 0 ? "" : ` Rows: ${rows.join("; ")}.`}`;
				bind(button, { kind: "node", id: node.id });
				item.append(button);
				list.append(item);
			}
			holder.append(list);
			const edgeList = document.createElement("ol");
			edgeList.setAttribute("aria-label", "Edges");
			const order = new Map(nodes.map(({ id }, index) => [id, index]));
			const at = (id: string) => order.get(id) ?? 0;
			const edges = [...model.edges].sort(
				(a, b) =>
					at(endNode(a.from)) - at(endNode(b.from)) || at(endNode(a.to)) - at(endNode(b.to)),
			);
			const crossings = new Map(
				[...svg.querySelectorAll<SVGGElement>("[data-edge]")].map((edge) => [
					edge.dataset.edge,
					edge.dataset.crosses,
				]),
			);
			for (const edge of edges) {
				const item = document.createElement("li");
				const button = document.createElement("button");
				button.type = "button";
				button.dataset.edgeItem = edge.id;
				button.textContent = `${sentenceOf(model, notation, edge, crossings.get(edge.id))}.`;
				bind(button, { kind: "edge", id: edge.id });
				item.append(button);
				edgeList.append(item);
			}
			holder.append(edgeList);
			if (model.groups.length > 0) {
				const groupList = document.createElement("ol");
				groupList.setAttribute("aria-label", "Groups");
				for (const group of model.groups) {
					const item = document.createElement("li");
					const button = document.createElement("button");
					button.type = "button";
					button.dataset.groupItem = group.id;
					button.textContent = `${collapseSpaces(group.title)} (${group.kind}).`;
					item.append(button);
					groupList.append(item);
				}
				holder.append(groupList);
			}
			element.append(holder);
			const status = document.createElement("p");
			status.className = "reader-status";
			status.setAttribute("role", "status");
			status.setAttribute("aria-atomic", "true");
			element.append(status);
			const previous = svg.getAttribute("aria-hidden");
			svg.setAttribute("aria-hidden", "true");
			const mark = () => {
				status.textContent = "";
				for (const { target, button } of buttons) {
					if (selection.current?.kind === target.kind && selection.current.id === target.id) {
						button.setAttribute("aria-current", "true");
						if (element.matches(":focus")) {
							status.textContent = button.textContent;
						}
					} else {
						button.removeAttribute("aria-current");
					}
				}
			};
			const unwatch = selection.watch(mark);
			mark();
			const events = new AbortController();
			element.addEventListener("focus", mark, { signal: events.signal });
			element.addEventListener(
				"blur",
				() => {
					status.textContent = "";
				},
				{ signal: events.signal },
			);
			if (restore !== undefined) {
				const item = buttons.find(
					({ target }) =>
						target.kind === restore.kind &&
						target.id === restore.id &&
						selection.current?.kind === target.kind &&
						selection.current.id === target.id,
				);
				(item?.button ?? element).focus({ preventScroll: true });
			}
			return () => {
				focused = element.isConnected
					? buttons.find(({ button }) => button.matches(":focus"))?.target
					: undefined;
				events.abort();
				unwatch();
				holder.remove();
				status.remove();
				if (previous === null) {
					svg.removeAttribute("aria-hidden");
				} else {
					svg.setAttribute("aria-hidden", previous);
				}
			};
		});
	},
};
