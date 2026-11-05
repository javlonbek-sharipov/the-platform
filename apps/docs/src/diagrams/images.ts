/**
 * Diagram images. A doc embeds a Diagram with plain Markdown image syntax,
 * `![Checkout](./checkout.diagram.svg)`, so that the same file works on
 * GitHub. On the site, the image becomes a `<platform-diagram>` with the SVG
 * inline, which shows before any script runs, and which the web component
 * makes explorable.
 */

import { readFileSync } from "node:fs";
import type { MdastPluginDefinition } from "satteri";

export const diagramImages: MdastPluginDefinition = {
	name: "diagram-images",
	paragraph(node, ctx) {
		const [only] = node.children;
		if (node.children.length !== 1 || only?.type !== "image") {
			return;
		}
		if (!only.url.endsWith(".diagram.svg") || ctx.fileURL === undefined) {
			return;
		}
		const svg = readFileSync(new URL(only.url, ctx.fileURL), "utf8");
		return { type: "html", value: `<platform-diagram>${svg}</platform-diagram>` };
	},
};
