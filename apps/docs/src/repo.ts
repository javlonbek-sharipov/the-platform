/**
 * The repo that the site shows: where it is, which of its files are docs, and
 * where each doc is on the site.
 */

import { type Dirent, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The repo's root: the repo this app is in, unless `DOCS_REPO` names another
 * one, as the tests do.
 */
export const repoRoot: string =
	process.env.DOCS_REPO ?? fileURLToPath(new URL("../../../", import.meta.url));

/** The folders whose own folders are the repo's packages and apps. */
const workspaces = ["apps", "packages"];

/**
 * Whether a file is one of the repo's docs, by its path from the root: a
 * glossary, the glossary map, or Markdown in a `docs` folder, of the repo
 * itself or of one of its packages and apps. So `docs/specs/checkout.md` and
 * `packages/shop/GLOSSARY.md` are docs, and nothing in `repos/` or
 * `node_modules/` ever is.
 */
export function isDoc(path: string): boolean {
	const [first = "", second, ...rest] = path.split("/");
	const inside = workspaces.includes(first) && second !== undefined ? rest : path.split("/");
	const [name = "", ...below] = inside;
	if (below.length === 0) {
		return name === "GLOSSARY.md" || name === "GLOSSARY-MAP.md";
	}
	return (
		name === "docs" &&
		path.endsWith(".md") &&
		below.every((part) => !part.startsWith(".") && part !== "node_modules")
	);
}

/**
 * The docs of the repo at `root`, as paths from it, in path order. Only the
 * places where a doc can be are read.
 */
export function docsOf(root: string): string[] {
	const scopes = ["", ...workspaces.flatMap((folder) => foldersIn(root, folder))];
	return scopes
		.flatMap((scope) => [
			...["GLOSSARY-MAP.md", "GLOSSARY.md"].map((name) => `${scope}${name}`),
			...filesIn(root, `${scope}docs`),
		])
		.filter((path) => isDoc(path) && isFile(root, path))
		.sort();
}

/** The folders in a folder of the repo, each as a path from the root that ends with a slash. */
function foldersIn(root: string, folder: string): string[] {
	return entriesOf(root, folder)
		.filter((entry) => entry.isDirectory())
		.map((entry) => `${folder}/${entry.name}/`);
}

/** Every file under a folder of the repo, as paths from the root. Links aren't followed. */
function filesIn(root: string, folder: string): string[] {
	return entriesOf(root, folder).flatMap((entry) => {
		const path = `${folder}/${entry.name}`;
		if (entry.isDirectory()) {
			return filesIn(root, path);
		}
		return entry.isFile() ? [path] : [];
	});
}

/** What a folder of the repo holds, or nothing, if it isn't there. */
function entriesOf(root: string, folder: string): Dirent[] {
	try {
		return readdirSync(join(root, folder), { withFileTypes: true });
	} catch {
		return [];
	}
}

function isFile(root: string, path: string): boolean {
	const slash = path.lastIndexOf("/");
	return entriesOf(root, path.slice(0, Math.max(slash, 0))).some(
		(entry) => entry.isFile() && entry.name === path.slice(slash + 1),
	);
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
