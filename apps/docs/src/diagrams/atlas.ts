/** The site's Atlas is built in Node. Only its plain index goes into the page bundle. */

import { lstatSync } from "node:fs";
import { join } from "node:path";
import type { AtlasIndex } from "@the-platform/diagrams";
import { indexAtlas, openAtlas } from "@the-platform/diagrams/atlas";

export async function buildAtlas(root: string): Promise<AtlasIndex> {
	// A repo with prose alone needn't have an Atlas config.
	if (!lstatSync(join(root, "diagrams.config.ts"), { throwIfNoEntry: false })?.isFile()) {
		return { diagrams: [], ids: {}, terms: [] };
	}
	const opened = await openAtlas(root, undefined, { exclude: [join(root, "repos")] });
	const { index, errors } = await indexAtlas(opened);
	if (index === undefined) {
		throw new Error(errors.map(({ file, message }) => `${file}: ${message}`).join("\n"));
	}
	return index;
}
