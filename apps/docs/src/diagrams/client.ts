/**
 * What every page of the site runs in the browser. It defines
 * `<platform-diagram>`, which makes each Diagram on the page explorable.
 */

import { anchorOf, termOf } from "@the-platform/diagrams";
import type { DiagramNavigationEvent } from "@the-platform/diagrams/web-component";
import "@the-platform/diagrams/web-component";
import atlas from "virtual:diagram-atlas";

for (const diagram of document.querySelectorAll("platform-diagram")) {
	diagram.atlasIndex = atlas.index;
	diagram.resolveUrl = (target) => {
		if (typeof target === "string") return undefined;
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
}
