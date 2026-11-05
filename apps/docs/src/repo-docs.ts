/**
 * The loader of the site's pages: the repo's own docs, read from where they
 * live. Nothing is copied into the app.
 */

import { readFile } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Loader } from "astro/loaders";
import { docsOf, filesIn, idOf } from "./repo.ts";

/**
 * Loads each doc of the repo at `root` as a page, at the id that `idOf` gives
 * its path. The app's own pages, in its `src/content/docs`, come first: they
 * are what the site has to say for itself, such as its front page.
 */
export function repoDocs(root: string): Loader {
	return {
		name: "repo-docs",
		async load({ store, config, parseData, renderMarkdown, generateDigest }) {
			const own = fileURLToPath(new URL("content/docs", config.srcDir));
			const pages = [
				...filesIn(own, "")
					.filter((path) => path.endsWith(".md"))
					.map((path) => ({ id: idOf(path), file: join(own, path) })),
				...docsOf(root).map((path) => ({ id: idOf(path), file: join(root, path) })),
			];
			const loaded = new Map<string, string>();
			for (const { id, file } of pages) {
				const path = file;
				const other = loaded.get(id);
				if (other !== undefined) {
					throw new Error(
						`${other} and ${path} would both be the page /${id}/. Rename one of them.`,
					);
				}
				loaded.set(id, path);
				const text = await readFile(file, "utf8");
				// Rendering comes first: it's what finds the doc's title, in its first heading.
				const rendered = await renderMarkdown(text, { fileURL: pathToFileURL(file) });
				const data = await parseData({
					id,
					data: { title: basename(path, ".md"), ...rendered.metadata?.frontmatter },
					filePath: file,
				});
				store.set({
					id,
					data,
					body: text,
					filePath: relative(fileURLToPath(config.root), file).split(sep).join("/"),
					digest: generateDigest(rendered.html),
					rendered,
					assetImports: rendered.metadata?.imagePaths,
				});
			}
			for (const id of store.keys()) {
				if (!loaded.has(id)) {
					store.delete(id);
				}
			}
		},
	};
}
