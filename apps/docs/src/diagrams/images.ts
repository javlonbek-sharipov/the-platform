/**
 * Diagram images. A doc embeds a Diagram with plain Markdown image syntax,
 * `![Checkout](./checkout.diagram.svg)`, so that the same file works on
 * GitHub. On the site, the image becomes a `<platform-diagram>` with the SVG
 * inline, which shows before any script runs, and which the web component
 * makes explorable.
 */

import { existsSync, readFileSync } from "node:fs";
import type { MdastPluginDefinition } from "satteri";
import { diagramSuffix, embeddedFile, embedError } from "../repo.ts";

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
			if (file === undefined || !file.endsWith(diagramSuffix)) {
				return;
			}
			if (ctx.fileURL !== undefined && !existsSync(file)) {
				throw embedError(
					root,
					node.url,
					ctx.fileURL,
					"which doesn't exist. Run `pnpm exec diagrams render` to draw it.",
				);
			}
			const svg = readFileSync(file, "utf8");
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
