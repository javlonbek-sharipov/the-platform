import { satteri, satteriHeadingIdsPlugin } from "@astrojs/markdown-satteri";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { diagramImages } from "./src/diagrams/images.ts";
import { diagrams } from "./src/diagrams/integration.ts";
import { themeStyle } from "./src/diagrams/theme.ts";
import { pageTitle } from "./src/markdown/page-title.ts";
import { repoLinks } from "./src/markdown/repo-links.ts";
import { docsOf, repoRoot } from "./src/repo.ts";
import { sidebarOf } from "./src/sidebar.ts";

const title = "the-platform";

/** The docs site: the repo's glossaries, ADRs, specs and docs, with their Diagrams. */
export default defineConfig({
	markdown: {
		processor: satteri({
			mdastPlugins: [diagramImages(repoRoot), repoLinks(repoRoot)],
			// The headings get their ids first, the title's among them, as on GitHub.
			hastPlugins: [satteriHeadingIdsPlugin(), pageTitle],
		}),
	},
	integrations: [
		starlight({
			title,
			sidebar: sidebarOf(docsOf(repoRoot), title),
			head: [{ tag: "style", content: themeStyle() }],
		}),
		diagrams(),
	],
});
