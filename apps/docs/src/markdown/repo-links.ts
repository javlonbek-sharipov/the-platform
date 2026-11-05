/**
 * Links between the repo's files. A doc links to another file by its
 * relative path, which GitHub follows. On the site, a link to another doc
 * goes to that doc's page, and a link to any other file of the repo goes to
 * the file on GitHub. Other links stay as they're written.
 */

import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { MdastPluginDefinition } from "satteri";
import { github, idOf, isDoc } from "../repo.ts";

/**
 * Where a link written in the file at `from` leads on the site, if it's a
 * relative link to a file of the repo at `root`.
 */
function siteUrl(root: string, url: string, from: URL | undefined): string | undefined {
	// A link with a scheme, to a path from the site's root, or within its own page isn't relative to its file.
	if (from === undefined || /^([a-z][a-z0-9+.-]*:|\/|#)/i.test(url)) {
		return undefined;
	}
	const target = new URL(url, from);
	const path = relative(root, fileURLToPath(target)).split(sep).join("/");
	if (path === "" || path.startsWith("../")) {
		return undefined;
	}
	if (isDoc(path)) {
		const id = idOf(path);
		return `/${id === "index" ? "" : `${id}/`}${target.hash}`;
	}
	return `${github.url}/blob/${github.branch}/${path}${target.hash}`;
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
