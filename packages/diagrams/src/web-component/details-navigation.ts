/** Links and Atlas navigation offered by one Node or Group's details. */

import { termOf } from "../atlas/terms.ts";
import type { GlossaryTerm } from "../atlas/types.ts";
import type { AnyNode, Link } from "../authoring/model.ts";
import type { Navigation, NavigationSource, NavigationTarget } from "./navigation.ts";

export function navigationFor(
	subject: AnyNode,
	source: NavigationSource,
	navigation: Navigation,
	context?: string,
): DocumentFragment {
	const content = document.createDocumentFragment();
	const list = (
		name: string,
		actions: { text: string; target: NavigationTarget; definition?: string }[],
	) => {
		if (actions.length === 0) return;
		const title = document.createElement("h3");
		title.textContent = name;
		const items = document.createElement("ul");
		items.setAttribute("aria-label", name);
		for (const { text, target, definition } of actions) {
			const item = document.createElement("li");
			const button = document.createElement("button");
			button.type = "button";
			button.dataset.navigation = JSON.stringify([name, target]);
			button.textContent = text;
			button.addEventListener("click", () => navigation.request(target, source));
			item.append(button);
			if (definition !== undefined) {
				const explanation = document.createElement("p");
				explanation.textContent = definition;
				item.append(explanation);
			}
			items.append(item);
		}
		content.append(title, items);
	};
	const index = navigation.index;
	list(
		"Links",
		(subject.links ?? []).map((link) => {
			const target =
				link.term !== undefined && link.context === undefined && context !== undefined
					? { ...link, context }
					: link;
			const term = link.term === undefined ? undefined : termOf(index?.terms ?? [], link, context);
			return { text: textOfLink(link, term, index?.ids), target, definition: term?.definition };
		}),
	);
	const drawn = index?.ids[subject.id];
	const otherIds = new Set([...(drawn?.asNode ?? []), ...(drawn?.asGroup ?? [])]);
	const others = (index?.diagrams ?? []).filter(
		({ id }) => id !== source.diagram && otherIds.has(id),
	);
	const actions = others.map(({ id, title }) => ({ text: title, target: id }));
	list("Other Diagrams", actions);
	if (source.kind === "node") {
		const groups = new Set(drawn?.asGroup);
		const owner = drawn?.context ?? context;
		const homes = owner === undefined ? [] : (index?.ids[owner]?.asGroup ?? []);
		if (!homes.includes(source.diagram ?? "")) {
			for (const home of homes) {
				if (drawn?.asNode.includes(home)) groups.add(home);
			}
		}
		list(
			"Drill down",
			actions.filter(({ target }) => groups.has(target)),
		);
	}
	return content;
}

function textOfLink(
	link: Link,
	term: GlossaryTerm | undefined,
	ids: Record<string, { title: string }> | undefined,
): string {
	return (
		link.label ??
		(link.id === undefined ? undefined : ids?.[link.id]?.title) ??
		term?.term ??
		link.id ??
		link.term ??
		`${link.doc}${link.section === undefined ? "" : ` # ${link.section}`}`
	);
}
