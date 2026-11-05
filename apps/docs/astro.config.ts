import { satteri } from "@astrojs/markdown-satteri";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { diagramImages } from "./src/markdown/diagram-images.ts";

/** The docs site: the repo's glossaries, ADRs, specs and docs, with their Diagrams. */
export default defineConfig({
	markdown: {
		processor: satteri({ mdastPlugins: [diagramImages] }),
	},
	integrations: [starlight({ title: "the-platform" })],
});
