/** The published destinations of document Links, from the same heading processor as the site. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { satteriHeadingIdsPlugin } from "@astrojs/markdown-satteri";
import { markdownToHtml } from "satteri";
import { docsOf, pageOf } from "../repo.ts";

export interface SitePage {
	url: string;
	/** Heading anchor to actual site anchor; the first h1 becomes Starlight's title. */
	sections: Record<string, string>;
}

export async function pagesOf(root: string): Promise<Record<string, SitePage>> {
	const pages: Record<string, SitePage> = {};
	for (const path of docsOf(root)) {
		const page: SitePage = { url: pageOf(path), sections: {} };
		let title = false;
		await markdownToHtml(readFileSync(join(root, path), "utf8"), {
			features: { smartPunctuation: false },
			hastPlugins: [
				satteriHeadingIdsPlugin(),
				{
					name: "site-sections",
					element: {
						filter: ["h1", "h2", "h3", "h4", "h5", "h6"],
						visit(node) {
							const anchor = node.properties.id;
							if (typeof anchor !== "string") return;
							const firstTitle = node.tagName === "h1" && !title;
							page.sections[anchor] = firstTitle ? "_top" : anchor;
							if (firstTitle) title = true;
						},
					},
				},
			],
		});
		pages[path] = page;
	}
	return pages;
}
