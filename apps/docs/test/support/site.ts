/**
 * Building the docs site, as `astro build` does, for a repo that a test
 * names, and reading the pages it wrote.
 */

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "astro";
import { afterAll } from "vitest";

/** The docs app. */
export const app = fileURLToPath(new URL("../../", import.meta.url));

// A test run sends nothing to Astro's telemetry.
process.env.ASTRO_TELEMETRY_DISABLED = "1";

export interface Site {
	/** The folder the site was written to. */
	folder: string;
	/** The HTML of a page, by its path on the site, such as `docs/specs/checkout`. */
	page(path: string): Promise<string>;
	/** The files that hold a text, among all that the build wrote: the site, and what it keeps to build faster. */
	filesWith(text: string): Promise<string[]>;
}

/** The folders that builds wrote into, which go when the test file is over. */
const written: string[] = [];
let failed = false;

afterAll(async () => {
	// A build that failed still writes what it keeps, half a second later. Its folder goes after that.
	if (failed) {
		await new Promise((resolve) => setTimeout(resolve, 600));
	}
	await Promise.all(
		written.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
	);
});

/**
 * Builds the site of the repo at `repo`. It's written, with what the build
 * keeps to build faster, into a temporary folder, so that a test's build
 * leaves the app's own alone.
 */
export async function buildSite(repo: string): Promise<Site> {
	const folder = await mkdtemp(join(tmpdir(), "docs-site-"));
	written.push(folder);
	const outDir = join(folder, "dist");
	process.env.DOCS_REPO = repo;
	try {
		await build({ root: app, outDir, cacheDir: join(folder, "cache"), logLevel: "silent" });
	} catch (error) {
		failed = true;
		throw error;
	} finally {
		delete process.env.DOCS_REPO;
	}
	return {
		folder: outDir,
		page: (path) => readFile(join(outDir, path, "index.html"), "utf8"),
		filesWith: async (text) => {
			const files = await readdir(folder, { recursive: true, withFileTypes: true });
			const holding: string[] = [];
			for (const file of files.filter((entry) => entry.isFile())) {
				const path = join(file.parentPath, file.name);
				if ((await readFile(path)).includes(text)) {
					holding.push(relative(folder, path));
				}
			}
			return holding;
		},
	};
}
