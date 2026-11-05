/**
 * Diagram images. A doc embeds a Diagram with plain Markdown image syntax,
 * `![Checkout](./checkout.diagram.svg)`, so that the same file works on
 * GitHub. On the site, the image becomes a `<platform-diagram>` with the SVG
 * inline, which shows before any script runs, and which the web component
 * makes explorable.
 */

import { readFileSync } from "node:fs";
import type { MdastPluginDefinition } from "satteri";
import { embeddedFile, pathIn } from "../repo.ts";

const diagram = ".diagram.svg";

/**
 * Turns each image of a `*.diagram.svg` in the docs of the repo at `root`
 * into the web component. Any other picture stays an image, and must be one
 * of the repo's own files too.
 */
export function diagramImages(root: string): MdastPluginDefinition {
	return {
		name: "diagram-images",
		image(node, ctx) {
			const file = embeddedFile(root, node.url, ctx.fileURL);
			if (file === undefined || !file.endsWith(diagram)) {
				return;
			}
			let svg: string;
			try {
				svg = readFileSync(file, "utf8");
			} catch {
				const doc = ctx.fileURL === undefined ? "A doc" : pathIn(root, ctx.fileURL.pathname);
				throw new Error(
					`${doc} embeds ${node.url}, which doesn't exist. Run \`pnpm exec diagrams render\` to draw it.`,
				);
			}
			const component = {
				type: "html",
				value: `<platform-diagram>${svg}</platform-diagram>`,
			} as const;
			// A Diagram on a line of its own is a block of the page, not a part of a paragraph.
			const parent = ctx.parent(node);
			if (parent.type === "paragraph" && parent.children.length === 1) {
				ctx.replaceNode(parent, component);
				return;
			}
			return component;
		},
	};
}
