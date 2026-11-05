import { satteri, satteriHeadingIdsPlugin } from "@astrojs/markdown-satteri";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { diagramImages } from "./src/diagrams/images.ts";
import { diagrams } from "./src/diagrams/integration.ts";
import { pageTitle } from "./src/markdown/page-title.ts";
import { repoLinks } from "./src/markdown/repo-links.ts";
import { repoRoot } from "./src/repo.ts";

/** The docs site: the repo's glossaries, ADRs, specs and docs, with their Diagrams. */
export default defineConfig({
	markdown: {
		processor: satteri({
			mdastPlugins: [diagramImages, repoLinks(repoRoot)],
			// The headings get their ids first, the title's among them, as on GitHub.
			hastPlugins: [satteriHeadingIdsPlugin(), pageTitle],
		}),
	},
	integrations: [starlight({ title: "the-platform" }), diagrams()],
});
