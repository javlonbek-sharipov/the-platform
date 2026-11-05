/**
 * A page's title. On GitHub, a doc's first `# Heading` is its title. On the
 * site, Starlight prints each page's title itself, from the page's data. So
 * the first heading is taken out of the body and handed to the page as its
 * title, unless the doc's frontmatter has one.
 *
 * It runs after the headings have their ids, so that the ones that stay keep
 * the anchors GitHub gives them: a later heading with the title's words is
 * still `#shop-1`.
 */

import type { HastPluginEntry } from "satteri";

/** What Astro keeps for each document while it's rendered, as far as this plugin reads it. */
interface AstroData {
	frontmatter: Record<string, unknown>;
}

export const pageTitle: HastPluginEntry = () => {
	let found = false;
	return {
		name: "page-title",
		element: {
			filter: ["h1"],
			visit(node, ctx) {
				if (found) {
					return;
				}
				found = true;
				const astro = ctx.data.astro as AstroData | undefined;
				if (astro !== undefined) {
					astro.frontmatter.title ??= ctx.textContent(node);
				}
				ctx.removeNode(node);
			},
		},
	};
};
