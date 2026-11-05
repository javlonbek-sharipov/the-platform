/**
 * The loader of the site's pages: the repo's own docs, read from where they
 * live. Nothing is copied into the app.
 */

import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Loader, LoaderContext } from "astro/loaders";
import { diagramSuffix, docPlaces, docsOf, filesIn, github, idOf, isDoc, pathIn } from "./repo.ts";

/**
 * Loads each doc of the repo at `root` as a page, at the id that `idOf` gives
 * its path. The app's own pages, in its `src/content/docs`, come first: they
 * are what the site has to say for itself, such as its front page.
 *
 * Every page is rendered each time, so that a Diagram drawn again shows even
 * when the doc that embeds it hasn't changed.
 */
export function repoDocs(root: string): Loader {
	return {
		name: "repo-docs",
		async load(context) {
			await loadPages(root, context, false);
			watch(root, context);
		},
	};
}

/**
 * Loads every page. Pages whose docs are gone go too, unless they're to be
 * kept, as they are while the site is being developed.
 */
async function loadPages(root: string, context: LoaderContext, keep: boolean): Promise<void> {
	const { store, config, parseData, renderMarkdown, generateDigest } = context;
	const own = fileURLToPath(new URL("content/docs", config.srcDir));
	// The app's own pages are files of the repo that the app is in, two folders up.
	const home = fileURLToPath(new URL("../../", config.root));
	const files = [
		...filesIn(own, "")
			.filter((path) => path.endsWith(".md"))
			.map((path) => ({
				id: idOf(path),
				file: join(own, path),
				path: pathIn(home, join(own, path)),
			})),
		...docsOf(root).map((path) => ({ id: idOf(path), file: join(root, path), path })),
	];
	const loaded = new Map<string, string>();
	for (const { id, file, path } of files) {
		const other = loaded.get(id);
		if (other !== undefined) {
			throw new Error(`${other} and ${file} would both be the page /${id}/. Rename one of them.`);
		}
		loaded.set(id, file);
		const text = await readFile(file, "utf8");
		// Rendering comes first: it's what finds the doc's title, in its first heading.
		const rendered = await renderMarkdown(text, { fileURL: pathToFileURL(file) });
		const data = await parseData({
			id,
			data: {
				title: basename(file, ".md"),
				// Each page's "Edit page" link opens its file, where it lives in the repo.
				editUrl: `${github.url}/edit/${github.branch}/${path}`,
				...rendered.metadata?.frontmatter,
			},
			filePath: file,
		});
		store.set({
			id,
			data,
			body: text,
			filePath: pathIn(fileURLToPath(config.root), file),
			digest: generateDigest(rendered.html),
			rendered,
			assetImports: rendered.metadata?.imagePaths,
		});
	}
	if (!keep) {
		for (const id of store.keys()) {
			if (!loaded.has(id)) {
				store.delete(id);
			}
		}
	}
}

/**
 * While the site is being developed, shows each doc as it's edited or added,
 * and each Diagram as it's drawn again. Only the places where the repo's docs
 * are get watched, not the repo: its other folders hold far more files, and
 * `repos/` holds other projects'.
 *
 * The sidebar is made when the server starts. So a doc that's added has its
 * page at once, and joins the sidebar at the next start, and one that's
 * removed keeps its page until then.
 */
function watch(root: string, context: LoaderContext): void {
	const { watcher, logger } = context;
	if (watcher === undefined) {
		return;
	}
	watcher.add(docPlaces(root).map((place) => join(root, place)));
	const own = fileURLToPath(new URL("content/docs", context.config.srcDir));
	let loading: Promise<void> | undefined;
	let again = false;
	const reload = () => {
		if (loading !== undefined) {
			again = true;
			return;
		}
		loading = loadPages(root, context, true)
			.catch((error: unknown) => logger.error(error instanceof Error ? error.message : `${error}`))
			.finally(() => {
				loading = undefined;
				if (again) {
					again = false;
					reload();
				}
			});
	};
	const changed = (file: string) => {
		const path = pathIn(root, file);
		const inRepo = !path.startsWith("../") && (isDoc(path) || path.endsWith(diagramSuffix));
		if (inRepo || (!pathIn(own, file).startsWith("../") && file.endsWith(".md"))) {
			reload();
		}
	};
	watcher.on("add", changed);
	watcher.on("change", changed);
}
