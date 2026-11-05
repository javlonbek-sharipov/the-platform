/** The site's Atlas is built in Node. Only its plain index goes into the page bundle. */

import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AtlasIndex } from "@the-platform/diagrams";
import { indexAtlas, openAtlas } from "@the-platform/diagrams/atlas";

export async function buildAtlas(root: string): Promise<AtlasIndex> {
	// A repo with prose alone needn't have an Atlas config.
	if (!lstatSync(join(root, "diagrams.config.ts"), { throwIfNoEntry: false })?.isFile()) {
		return { diagrams: [], ids: {}, terms: [] };
	}
	const files: string[] = [];
	const visit = (folder: string) => {
		for (const entry of readdirSync(folder, { withFileTypes: true })) {
			const path = join(folder, entry.name);
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			if (folder === root && entry.name === "repos") continue;
			if (entry.isDirectory()) visit(path);
			else if (entry.isFile()) files.push(path);
		}
	};
	visit(root);
	const opened = await openAtlas(root, {
		modules: files.filter((path) => path.endsWith(".diagram.ts")).sort(),
		svgs: files.filter((path) => path.endsWith(".diagram.svg")).sort(),
	});
	const { index, errors } = await indexAtlas(opened);
	if (index === undefined) {
		throw new Error(errors.map(({ file, message }) => `${file}: ${message}`).join("\n"));
	}
	return index;
}
