import { satteri, satteriHeadingIdsPlugin } from "@astrojs/markdown-satteri";
import starlight from "@astrojs/starlight";
import { defineConfig, passthroughImageService } from "astro/config";
import { diagramImages } from "./src/diagrams/images.ts";
import { diagrams } from "./src/diagrams/integration.ts";
import { themeStyle } from "./src/diagrams/theme.ts";
import { codeLanguages } from "./src/markdown/code-languages.ts";
import { pageTitle } from "./src/markdown/page-title.ts";
import { repoLinks } from "./src/markdown/repo-links.ts";
import { docsOf, repoRoot } from "./src/repo.ts";
import { sidebarOf } from "./src/sidebar.ts";

const title = "the-platform";

/** The docs site: the repo's glossaries, ADRs, specs and docs, with their Diagrams. */
export default defineConfig({
	// A doc's picture is shown as the file it is. Astro would resize it with sharp, which the
	// repo leaves out: it brings libvips, under the LGPL.
	image: { service: passthroughImageService() },
	markdown: {
		processor: satteri({
			mdastPlugins: [diagramImages(repoRoot), repoLinks(repoRoot), codeLanguages],
			// The headings get their ids first, the title's among them, as on GitHub.
			hastPlugins: [satteriHeadingIdsPlugin(), pageTitle],
			// A doc reads as it's written, and as GitHub shows it: `--` stays two hyphens.
			features: { smartPunctuation: false },
		}),
	},
	integrations: [
		starlight({
			title,
			sidebar: sidebarOf(docsOf(repoRoot), title),
			head: [{ tag: "style", content: themeStyle() }],
			customCss: ["./src/diagrams/frame.css"],
			// Starlight's own touches, such as each heading's link to itself, are for the repo's docs too.
			markdown: { processedDirs: [repoRoot] },
		}),
		diagrams(),
	],
});
