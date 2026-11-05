/**
 * The repo that the site shows: where it is, which of its files are docs, and
 * where each doc is on the site.
 */

import { type Dirent, lstatSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The repo's root: the repo this app is in, unless `DOCS_REPO` names another
 * one, as the tests do.
 */
export const repoRoot: string = resolve(
	process.env.DOCS_REPO ?? fileURLToPath(new URL("../../../", import.meta.url)),
);

/** Where the repo is on GitHub, and the branch that the site is built from. */
export const github = {
	url: "https://github.com/javlonbek-sharipov/the-platform",
	branch: "main",
};

/**
 * The folder at the repo's root that holds other projects' files, for
 * reading. Git ignores it, and the site never reads, watches or shows
 * anything in it.
 */
const others = "repos";

/** The folders whose own folders are the repo's packages and apps. */
const workspaces = ["apps", "packages"];

/** The names of a glossary, and of the map of the repo's glossaries. */
const glossaries = ["GLOSSARY-MAP.md", "GLOSSARY.md"];

/** The file of a Diagram's drawing, which a doc embeds as an image. */
export const diagramSuffix = ".diagram.svg";

/**
 * The package or app that a file belongs to, by its path from the root, as
 * `packages/shop/`. It's empty for a file of the repo itself.
 */
export function scopeOf(path: string): string {
	const [first = "", second, ...inside] = path.split("/");
	return workspaces.includes(first) && inside.length > 0 ? `${first}/${second}/` : "";
}

/** Whether a folder is one that never holds docs: a hidden one, or `node_modules`. */
function isSkipped(folder: string): boolean {
	return folder.startsWith(".") || folder === "node_modules";
}

/**
 * Whether a file is one of the repo's docs, by its path from the root: a
 * glossary, the glossary map, or Markdown in a `docs` folder, of the repo
 * itself or of one of its packages and apps. So `docs/specs/checkout.md` and
 * `packages/shop/GLOSSARY.md` are docs, and nothing in `repos/`, in
 * `node_modules/` or in a hidden folder ever is.
 */
export function isDoc(path: string): boolean {
	const folders = path.split("/").slice(0, -1);
	const [name = "", ...below] = path.slice(scopeOf(path).length).split("/");
	if (folders.some(isSkipped)) {
		return false;
	}
	return below.length === 0 ? glossaries.includes(name) : name === "docs" && path.endsWith(".md");
}

/**
 * The places where the docs of the repo at `root` are, as paths from it: the
 * `docs` folder and the glossaries of the repo itself, and of each of its
 * packages and apps. Nothing else is read to find the docs.
 */
function docPlaces(root: string): string[] {
	const scopes = ["", ...workspaces.flatMap((folder) => foldersIn(root, folder))];
	return scopes
		.flatMap((scope) => [...glossaries, "docs"].map((name) => `${scope}${name}`))
		.filter((place) => kindOf(join(root, place)) === (place.endsWith(".md") ? "file" : "folder"));
}

/** Every file in the places where the repo's docs are, as paths from the root. A link is no file. */
function filesOfDocs(root: string): string[] {
	return docPlaces(root).flatMap((place) =>
		place.endsWith(".md") ? [place] : filesIn(root, place),
	);
}

/** The docs of the repo at `root`, as paths from it, in path order. */
export function docsOf(root: string): string[] {
	return filesOfDocs(root).filter(isDoc).sort();
}

/**
 * The files that the pages of the repo at `root` are made from, as paths
 * from it: its docs, and the Diagrams' SVGs kept beside them. These are what
 * the site watches while it's developed: each file by itself, never a folder,
 * so that nothing a link leads to is watched, in `repos/` or anywhere else.
 */
export function sourcesOf(root: string): string[] {
	return filesOfDocs(root).filter((path) => isDoc(path) || path.endsWith(diagramSuffix));
}

/** The folders in a folder of the repo, each as a path from the root that ends with a slash. */
function foldersIn(root: string, folder: string): string[] {
	return entriesOf(root, folder)
		.filter((entry) => entry.isDirectory() && !isSkipped(entry.name))
		.map((entry) => `${folder}/${entry.name}/`);
}

/** Every file under a folder, as paths from `root`. Links aren't followed. */
export function filesIn(root: string, folder: string): string[] {
	return entriesOf(root, folder).flatMap((entry) => {
		const path = folder === "" ? entry.name : `${folder}/${entry.name}`;
		if (entry.isDirectory()) {
			return filesIn(root, path);
		}
		return entry.isFile() ? [path] : [];
	});
}

/** What a folder holds, or nothing, if it isn't there. */
function entriesOf(root: string, folder: string): Dirent[] {
	try {
		return readdirSync(join(root, folder), { withFileTypes: true });
	} catch {
		return [];
	}
}

/** Whether a path is a file or a folder. It's neither when it's a link, or isn't there. */
function kindOf(path: string): "file" | "folder" | undefined {
	try {
		const found = lstatSync(path);
		return found.isFile() ? "file" : found.isDirectory() ? "folder" : undefined;
	} catch {
		return undefined;
	}
}

/**
 * A doc's id on the site, which is the path of its page: its path in the
 * repo, without `.md`, in lowercase, so `packages/shop/GLOSSARY.md` is at
 * `/packages/shop/glossary/`. An `index.md` is its folder's page.
 */
export function idOf(path: string): string {
	const id = path
		.replace(/\.md$/, "")
		.split("/")
		.map((part) => part.toLowerCase().replace(/[^a-z0-9._-]+/g, "-"))
		.join("/");
	return id.replace(/(^|\/)index$/, "") || "index";
}

/** The path of a doc's page on the site, by the doc's path from the repo's root, as `/docs/specs/checkout/`. */
export function pageOf(path: string): string {
	const id = idOf(path);
	return id === "index" ? "/" : `/${id}/`;
}

/** A file's path from the repo's root, with forward slashes. It starts with `../` for a file outside the repo. */
export function pathIn(root: string, file: string): string {
	return relative(root, file).split(sep).join("/");
}

/** Whether a URL written in a doc is relative to the doc: not one with a scheme, from the site's root, or within its page. */
function isRelative(url: string): boolean {
	return !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(url);
}

/**
 * The file that a relative URL in a doc of the repo at `root` names, or
 * nothing for a URL that isn't relative to its doc.
 */
export function fileAt(url: string, doc: URL | undefined): string | undefined {
	return doc === undefined || !isRelative(url) ? undefined : fileURLToPath(new URL(url, doc));
}

/**
 * The file that a doc embeds by a relative URL, such as a picture, which the
 * site then reads and shows. It must be one of the repo's own: a file outside
 * the repo, or in `repos/`, stops the build, and so does one that only links
 * there.
 */
export function embeddedFile(root: string, url: string, doc: URL | undefined): string | undefined {
	const file = fileAt(url, doc);
	if (file === undefined || doc === undefined) {
		return undefined;
	}
	// Where the file is by its path, and where it really is, if a link leads elsewhere.
	for (const path of [pathIn(root, file), pathIn(realpathSync(root), really(file))]) {
		if (path.startsWith("../") || isAbsolute(path)) {
			throw embedError(
				root,
				url,
				doc,
				"a file outside the repo. The site shows only the repo's own files.",
			);
		}
		if (path.split("/")[0] === others) {
			throw embedError(
				root,
				url,
				doc,
				`a file in ${others}/. The site shows nothing from ${others}/, which holds other projects' files.`,
			);
		}
	}
	return file;
}

/** The error that stops the build when a doc embeds a file the site can't show, which says what is wrong with it. */
export function embedError(root: string, url: string, doc: URL, problem: string): Error {
	return new Error(`${pathIn(root, fileURLToPath(doc))} embeds ${url}, ${problem}`);
}

/** Where a file really is, when it or a folder above it is a link. A file that doesn't exist is where its path says. */
function really(file: string): string {
	try {
		return realpathSync(file);
	} catch {
		return file;
	}
}
