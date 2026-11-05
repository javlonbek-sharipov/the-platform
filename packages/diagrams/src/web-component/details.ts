/** Details read from the SVG's model, useful with or without an Atlas index. */

import type { AnyNode } from "../authoring/model.ts";
import { technologyOf } from "../core/technology.ts";
import { navigationFor } from "./details-navigation.ts";
import type { Part } from "./stage.ts";
import { modelOf } from "./svg.ts";

type SubjectKind = "node" | "group";
interface OpenDetails {
	diagram: string;
	kind: SubjectKind;
	id: string;
	focus: boolean;
	trigger?: { kind: SubjectKind; id: string };
}

export const details: Part = {
	css: `
.details {
	position: absolute;
	inset: 8px 8px auto auto;
	z-index: 3;
	width: min(22rem, calc(100% - 16px));
	max-height: calc(100% - 16px);
	box-sizing: border-box;
	overflow: auto;
	padding: 16px;
	border: 1px solid var(--theme-border);
	border-radius: 4px;
	background: var(--theme-surface);
	color: var(--theme-ink);
	font: 14px / 1.5 Helvetica, Arial, sans-serif;
	overflow-wrap: anywhere;
	cursor: auto;
}
.details h2 { margin: 0 0 8px; font-size: 18px; }
.details dt { font-weight: 600; }
.details dd { margin: 0 0 8px; white-space: pre-wrap; }
.details p { white-space: pre-wrap; }
.details button { font: inherit; cursor: pointer; }
.details :focus-visible { outline: 2px solid var(--theme-accent); outline-offset: 2px; }
`,
	setUp({ element, selection, navigation, onShow }) {
		let pending: OpenDetails | undefined;
		onShow((svg) => {
			const restore = pending;
			pending = undefined;
			const model = modelOf(svg);
			if (model === undefined) {
				return undefined;
			}
			let panel: HTMLElement | undefined;
			let opened: { kind: SubjectKind; id: string } | undefined;
			let updateActions: (() => void) | undefined;
			const unwatch = navigation.watch(() => updateActions?.());
			let returnTo: HTMLElement = element;
			const close = () => {
				panel?.remove();
				panel = undefined;
				opened = undefined;
				updateActions = undefined;
				(returnTo.isConnected ? returnTo : element).focus({ preventScroll: true });
			};
			const open = (
				node: AnyNode,
				trigger: HTMLElement = element,
				kind: SubjectKind = "node",
				moveFocus = true,
			) => {
				opened = { kind, id: node.id };
				returnTo = trigger;
				panel?.remove();
				panel = document.createElement("section");
				panel.className = "details";
				panel.setAttribute("role", "dialog");
				panel.setAttribute("aria-label", `${node.title} details`);
				panel.tabIndex = -1;
				const title = document.createElement("h2");
				title.textContent = node.title;
				const dismiss = document.createElement("button");
				dismiss.type = "button";
				dismiss.textContent = "Close details";
				dismiss.addEventListener("click", close);
				panel.append(title, dismiss, factsOf(node));
				if (node.description !== undefined) {
					const description = document.createElement("p");
					description.textContent = node.description;
					panel.append(description);
				}
				const actions = document.createElement("div");
				panel.append(actions);
				updateActions = () =>
					actions.replaceChildren(
						navigationFor(
							node,
							{
								diagram: model.id,
								kind,
								id: node.id,
							},
							navigation,
							navigation.contextOf(model, node.id),
						),
					);
				updateActions();
				element.append(panel);
				if (moveFocus) panel.focus({ preventScroll: true });
			};
			const events = new AbortController();
			element.addEventListener(
				"keydown",
				(event) => {
					if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
						return;
					}
					if (event.key === "Escape" && panel !== undefined) {
						close();
						selection.select(undefined);
						event.preventDefault();
					} else if (event.key === "Enter" && event.target === element) {
						const node = model.nodes.find(
							({ id }) => selection.current?.kind === "node" && id === selection.current.id,
						);
						if (node !== undefined) {
							open(node);
							event.preventDefault();
						}
					}
				},
				{ capture: true, signal: events.signal },
			);
			element.addEventListener(
				"click",
				(event) => {
					const item =
						event.target instanceof Element
							? event.target.closest("[data-node-item], [data-group-item]")
							: null;
					if (!(item instanceof HTMLButtonElement)) {
						return;
					}
					const node =
						item.dataset.nodeItem === undefined
							? model.groups.find(({ id }) => id === item.dataset.groupItem)
							: model.nodes.find(({ id }) => id === item.dataset.nodeItem);
					if (node !== undefined) {
						open(node, item, item.dataset.groupItem === undefined ? "node" : "group");
					}
				},
				{ signal: events.signal },
			);
			for (const drawn of svg.querySelectorAll<SVGGElement>("[data-node]")) {
				const node = model.nodes.find(({ id }) => id === drawn.dataset.node);
				if (node !== undefined) {
					drawn.addEventListener("click", () => open(node), { signal: events.signal });
				}
			}
			for (const drawn of svg.querySelectorAll<SVGGElement>("[data-group]")) {
				const group = model.groups.find(({ id }) => id === drawn.dataset.group);
				if (group !== undefined) {
					drawn
						.querySelector(":scope > text")
						?.addEventListener("click", () => open(group, element, "group"), {
							signal: events.signal,
						});
				}
			}
			if (restore !== undefined && restore.diagram === model.id) {
				const subject = (restore.kind === "node" ? model.nodes : model.groups).find(
					({ id }) => id === restore.id,
				);
				if (subject !== undefined) {
					const trigger = [
						...element.querySelectorAll<HTMLButtonElement>("[data-node-item], [data-group-item]"),
					].find((button) =>
						restore.trigger?.kind === "node"
							? button.dataset.nodeItem === restore.trigger.id
							: restore.trigger !== undefined && button.dataset.groupItem === restore.trigger.id,
					);
					open(subject, trigger ?? element, restore.kind, restore.focus);
				}
			}
			return () => {
				const ownsFocus = panel?.matches(":focus-within") === true;
				if (opened !== undefined && model.id !== undefined && element.isConnected) {
					pending = {
						diagram: model.id,
						...opened,
						focus: ownsFocus,
						trigger:
							returnTo.dataset.nodeItem !== undefined
								? { kind: "node", id: returnTo.dataset.nodeItem }
								: returnTo.dataset.groupItem !== undefined
									? { kind: "group", id: returnTo.dataset.groupItem }
									: undefined,
					};
				}
				events.abort();
				unwatch();
				panel?.remove();
				if (ownsFocus && element.isConnected) element.focus({ preventScroll: true });
			};
		});
	},
};

function factsOf(node: AnyNode): HTMLDListElement {
	const list = document.createElement("dl");
	const fact = (name: string, value: string) => {
		const label = document.createElement("dt");
		label.textContent = name;
		const text = document.createElement("dd");
		text.textContent = value;
		list.append(label, text);
	};
	fact("Kind", node.kind);
	if (node.technology !== undefined) {
		fact("Technology", technologyOf(node.technology).name);
	}
	if (node.external !== undefined) {
		fact("External", node.external ? "Yes" : "No");
	}
	if (node.status !== undefined) {
		fact("Status", node.status);
	}
	for (const row of node.rows ?? []) {
		fact(row.name, row.value ?? "");
	}
	return list;
}
