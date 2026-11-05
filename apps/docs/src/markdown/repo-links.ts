/**
 * Links between the repo's files. A doc links to another file by its
 * relative path, which GitHub follows. On the site, a link to another doc
 * goes to that doc's page, and a link to any other file of the repo goes to
 * the file on GitHub. Other links stay as they're written.
 */

import type { MdastPluginDefinition } from "satteri";
import { fileAt, github, idOf, isDoc, pathIn } from "../repo.ts";

/**
 * Where a link written in the file at `from` leads on the site, if it's a
 * relative link to a file of the repo at `root`.
 */
function siteUrl(root: string, url: string, from: URL | undefined): string | undefined {
	const file = fileAt(url, from);
	if (file === undefined) {
		return undefined;
	}
	const path = pathIn(root, file);
	if (path === "" || path.startsWith("../")) {
		return undefined;
	}
	const { hash } = new URL(url, from);
	if (isDoc(path)) {
		const id = idOf(path);
		return `/${id === "index" ? "" : `${id}/`}${hash}`;
	}
	return `${github.url}/blob/${github.branch}/${path}${hash}`;
}

/** Rewrites the relative links of the docs of the repo at `root`. */
export function repoLinks(root: string): MdastPluginDefinition {
	return {
		name: "repo-links",
		link(node, ctx) {
			const url = siteUrl(root, node.url, ctx.fileURL);
			if (url !== undefined) {
				ctx.setProperty(node, "url", url);
			}
		},
		// A link written as a reference, `[text][name]`, has its URL in the definition of its name.
		definition(node, ctx) {
			const url = siteUrl(root, node.url, ctx.fileURL);
			if (url !== undefined) {
				ctx.setProperty(node, "url", url);
			}
		},
	};
}
