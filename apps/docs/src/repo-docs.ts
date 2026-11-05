/**
 * The loader of the site's pages: the repo's own Markdown, read from where it
 * lives. Nothing is copied into the app.
 */

import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Loader } from "astro/loaders";

/** Every Markdown file under a folder, as paths from `root`, in path order. */
function markdownIn(root: string, folder: string): string[] {
	let entries: import("node:fs").Dirent[];
	try {
		entries = readdirSync(join(root, folder), { withFileTypes: true });
	} catch {
		return [];
	}
	return entries
		.sort((a, b) => (a.name < b.name ? -1 : 1))
		.flatMap((entry) => {
			const path = `${folder}/${entry.name}`;
			if (entry.isDirectory()) {
				return markdownIn(root, path);
			}
			return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
		});
}

/** The docs of each package, as paths from the repo's root. */
function docsOf(root: string): string[] {
	return readdirSync(join(root, "packages")).flatMap((name) =>
		markdownIn(root, `packages/${name}/docs`),
	);
}

export function repoDocs(root: string): Loader {
	return {
		name: "repo-docs",
		async load({ store, config, parseData, renderMarkdown, generateDigest }) {
			for (const path of docsOf(root)) {
				const file = join(root, path);
				const text = await readFile(file, "utf8");
				const rendered = await renderMarkdown(text, { fileURL: pathToFileURL(file) });
				const id = path.slice(0, -".md".length);
				const data = await parseData({
					id,
					data: { title: id, ...rendered.metadata?.frontmatter },
					filePath: file,
				});
				store.set({
					id,
					data,
					body: text,
					filePath: relative(fileURLToPath(config.root), file).split(sep).join("/"),
					digest: generateDigest(rendered.html),
					rendered,
				});
			}
		},
	};
}
