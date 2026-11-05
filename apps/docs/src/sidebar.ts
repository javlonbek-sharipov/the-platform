/**
 * The site's sidebar: the repo's docs, grouped by where they live. The repo's
 * own docs come first, under the site's title, and then each package's and
 * each app's, under its folder's name. A glossary comes before its docs, and
 * each folder of docs is a group of its own.
 */

import type { StarlightUserConfig } from "@astrojs/starlight/types";
import { idOf, scopeOf } from "./repo.ts";

type Sidebar = NonNullable<StarlightUserConfig["sidebar"]>;

/** The sidebar for the docs at these paths from the repo's root, in a site with this title. */
export function sidebarOf(docs: string[], title: string): Sidebar {
	const scopes = new Map<string, string[]>([["", []]]);
	for (const path of [...docs].sort()) {
		const scope = scopeOf(path);
		scopes.set(scope, [...(scopes.get(scope) ?? []), path]);
	}
	return [...scopes]
		.filter(([, paths]) => paths.length > 0)
		.map(([scope, paths]) => ({
			label: scope === "" ? title : labelOf(scope.split("/").at(-2) ?? scope),
			items: itemsOf(paths, scope.length),
		}));
}

/**
 * The entries for some docs, as a tree of their folders below the first
 * `from` characters of their paths. A `docs` folder is no level of its own.
 */
function itemsOf(paths: string[], from: number): Sidebar {
	const items: Sidebar = [];
	const folders = new Map<string, string[]>();
	for (const path of paths) {
		const [name = "", ...below] = path.slice(from).split("/");
		if (below.length === 0) {
			// A glossary's title names its context, as its group in the sidebar already does.
			items.push(name === "GLOSSARY.md" ? { slug: idOf(path), label: "Glossary" } : idOf(path));
		} else if (!folders.has(name)) {
			const inside: string[] = [];
			folders.set(name, inside);
			const folder = from + name.length + 1;
			const entries = paths.filter((other) => other.slice(0, folder) === path.slice(0, folder));
			if (name === "docs") {
				items.push(...itemsOf(entries, folder));
			} else {
				items.push({ label: labelOf(name), items: itemsOf(entries, folder) });
			}
		}
	}
	return items;
}

/** A folder's name as a label: `adr` holds the ADRs, and `how-to` is "How to". */
function labelOf(folder: string): string {
	if (folder === "adr") {
		return "ADRs";
	}
	const words = folder.replaceAll("-", " ");
	return words.slice(0, 1).toUpperCase() + words.slice(1);
}
