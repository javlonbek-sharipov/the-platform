/**
 * What every page of the site runs in the browser. It defines
 * `<platform-diagram>`, which makes each Diagram on the page explorable.
 */

import { anchorOf, termOf } from "@the-platform/diagrams";
import type {
	DiagramNavigationEvent,
	DiagramSelectionEvent,
} from "@the-platform/diagrams/web-component";
import "@the-platform/diagrams/web-component";
import atlas from "virtual:diagram-atlas";

/** Prefer the doc beside the module when it embeds the drawing, then the first embedding doc in path order. */
function diagramUrl(id: string): string | undefined {
	if (!atlas.index.diagrams.some((diagram) => diagram.id === id)) return undefined;
	const pages = Object.entries(atlas.pages).filter(([, page]) => page.diagrams.includes(id));
	const chosen = pages.find(([path]) => path === `${id}.md`) ?? pages[0];
	return chosen === undefined ? undefined : `${chosen[1].url}#diagram=${encodeURIComponent(id)}`;
}

const diagrams = [...document.querySelectorAll("platform-diagram")];
for (const diagram of diagrams) {
	diagram.atlasIndex = atlas.index;
	diagram.resolveUrl = (target) => {
		if (typeof target === "string") return diagramUrl(target);
		if (target.id !== undefined) {
			const drawn = atlas.index.ids[target.id];
			const node = drawn?.asNode.find((id) => diagramUrl(id) !== undefined);
			const destination = node ?? drawn?.asGroup.find((id) => diagramUrl(id) !== undefined);
			const url = destination === undefined ? undefined : diagramUrl(destination);
			return url === undefined || node === undefined
				? url
				: `${url}&node=${encodeURIComponent(target.id)}`;
		}
		if (target.doc !== undefined) {
			const page = atlas.pages[target.doc];
			if (page === undefined) return undefined;
			if (target.section === undefined) return page.url;
			const anchor = page.sections[anchorOf(target.section)];
			return anchor === undefined ? undefined : `${page.url}#${encodeURIComponent(anchor)}`;
		}
		if (target.term === undefined) return undefined;
		const term = termOf(atlas.index.terms, target);
		const page = term === undefined ? undefined : atlas.pages[term.glossary];
		return page === undefined || term === undefined
			? undefined
			: `${page.url}#${encodeURIComponent(term.anchor)}`;
	};
	diagram.addEventListener("diagram-navigate", (event) => {
		const { url } = (event as DiagramNavigationEvent).detail;
		if (url !== undefined) window.location.assign(url);
	});
	diagram.addEventListener("diagram-select", (event) => {
		const target = (event as DiagramSelectionEvent).detail;
		const id = diagram.dataset.diagram;
		if (
			id === undefined ||
			target?.kind !== "node" ||
			!atlas.index.ids[target.id]?.asNode.includes(id)
		)
			return;
		const url = new URL(window.location.href);
		url.hash = `diagram=${encodeURIComponent(id)}&node=${encodeURIComponent(target.id)}`;
		window.history.replaceState(null, "", url);
	});
}

/** A Diagram fragment also works when several drawings share a page. */
function showTarget(): void {
	if (!window.location.hash.startsWith("#diagram=")) return;
	const parameters = new URLSearchParams(window.location.hash.slice(1));
	const id = parameters.get("diagram");
	const diagram = diagrams.find((element) => element.dataset.diagram === id);
	if (diagram === undefined || id === null) return;
	const node = parameters.get("node");
	if (node !== null) {
		if (!atlas.index.ids[node]?.asNode.includes(id) || !diagram.selectNode(node)) return;
	}
	diagram.scrollIntoView({ block: "center" });
}

window.addEventListener("hashchange", () => requestAnimationFrame(showTarget));
requestAnimationFrame(showTarget);
