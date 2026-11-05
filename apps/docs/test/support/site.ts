/**
 * Building the docs site, as `astro build` does, for a repo that a test
 * names, and reading the pages it wrote.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "astro";

/** The docs app. */
const app = fileURLToPath(new URL("../../", import.meta.url));

// A test run sends nothing to Astro's telemetry.
process.env.ASTRO_TELEMETRY_DISABLED = "1";

export interface Site {
	/** The folder the site was written to. */
	folder: string;
	/** The HTML of a page, by its path on the site, such as `docs/specs/checkout`. */
	page(path: string): Promise<string>;
	/** Removes what the build wrote. */
	remove(): Promise<void>;
}

/**
 * Builds the site of the repo at `repo`. It's written, with its cache, into a
 * temporary folder, so that a test's build leaves the app's own alone.
 */
export async function buildSite(repo: string): Promise<Site> {
	const folder = await mkdtemp(join(tmpdir(), "docs-site-"));
	const outDir = join(folder, "dist");
	process.env.DOCS_REPO = repo;
	try {
		await build({ root: app, outDir, cacheDir: join(folder, "cache"), logLevel: "error" });
	} finally {
		delete process.env.DOCS_REPO;
	}
	return {
		folder: outDir,
		page: (path) => readFile(join(outDir, path, "index.html"), "utf8"),
		remove: () => rm(folder, { recursive: true, force: true }),
	};
}
