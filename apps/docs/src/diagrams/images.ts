/**
 * Diagram images. A doc embeds a Diagram with plain Markdown image syntax,
 * `![Checkout](./checkout.diagram.svg)`, so that the same file works on
 * GitHub. On the site, the image becomes a `<platform-diagram>` with the SVG
 * inline, which shows before any script runs, and which the web component
 * makes explorable.
 */

import { existsSync, readFileSync } from "node:fs";
import type { MdastPluginDefinition, MdastPluginEntry } from "satteri";
import { diagramSuffix, embeddedFile, embedError, pathIn } from "../repo.ts";

type Visitor<Kind extends keyof MdastPluginDefinition> = NonNullable<MdastPluginDefinition[Kind]>;
type Context = Parameters<Visitor<"image">>[1];
type Image = Parameters<Visitor<"image">>[0];
type ImageReference = Parameters<Visitor<"imageReference">>[0];
type Definition = Parameters<Visitor<"definition">>[0];
type Tree = Parameters<NonNullable<MdastPluginDefinition["before"]>>[0];

/**
 * Turns each image of a `*.diagram.svg` in the docs of the repo at `root`
 * into the web component. Any other picture stays an image, and must be one
 * of the repo's own files too.
 */
export function diagramImages(root: string, onEmbed?: (file: string) => void): MdastPluginEntry {
	/**
	 * Puts the web component in an image's place, if the image is a Diagram's,
	 * and says whether it was.
	 */
	const embed = (node: Image | ImageReference, url: string, ctx: Context): boolean => {
		const file = embeddedFile(root, url, ctx.fileURL);
		if (file === undefined || !file.endsWith(diagramSuffix)) {
			return false;
		}
		if (ctx.fileURL !== undefined && !existsSync(file)) {
			throw embedError(
				root,
				url,
				ctx.fileURL,
				"which doesn't exist. Run `pnpm exec diagrams render` to draw it.",
			);
		}
		onEmbed?.(file);
		const id = pathIn(root, file).slice(0, -diagramSuffix.length);
		const attribute = id.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
		const component = {
			type: "html",
			value: `<platform-diagram data-diagram="${attribute}">${readFileSync(file, "utf8")}</platform-diagram>`,
		} as const;
		// A Diagram on a line of its own is a block of the page, not a part of a paragraph.
		const parent = ctx.parent(node);
		const alone = parent?.type === "paragraph" && parent.children.length === 1;
		ctx.replaceNode(alone ? parent : node, component);
		return true;
	};

	// Each doc gets a plugin of its own, which knows the doc's definitions.
	return () => {
		/** What each name stands for, for the images written as references: `![Checkout][drawing]`. */
		const definitions = new Map<string, Definition>();
		const collect = (node: Tree | Tree["children"][number]) => {
			if (node.type === "definition") {
				definitions.set(node.identifier, node);
			}
			if ("children" in node) {
				for (const child of node.children) {
					collect(child);
				}
			}
		};
		return {
			name: "diagram-images",
			before: collect,
			image(node, ctx) {
				embed(node, node.url, ctx);
			},
			imageReference(node, ctx) {
				const definition = definitions.get(node.identifier);
				if (definition !== undefined && !embed(node, definition.url, ctx)) {
					// Any other picture is written out as a plain image, which Astro shows as it shows the rest.
					const { url, title } = definition;
					ctx.replaceNode(node, { type: "image", url, title, alt: node.alt });
				}
			},
		};
	};
}
