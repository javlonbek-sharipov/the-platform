/**
 * Building the docs site, as `astro build` does, for a repo that a test
 * names, and reading the pages it wrote.
 */

import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { build, dev } from "astro";
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
	/** Builds the site again, with what the build before it kept. */
	again(): Promise<Site>;
}

/**
 * Where the tests' sites are written: inside the app, where git ignores them.
 * A site's pictures are made by a module that Astro writes beside the site,
 * and which finds Astro only from inside the app.
 */
const sites = join(app, "node_modules/.cache/site-tests");

/** A fresh folder for a site. */
async function siteFolder(): Promise<string> {
	await mkdir(sites, { recursive: true });
	const folder = await mkdtemp(join(sites, "site-"));
	written.push(folder);
	return folder;
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
 * Builds the site of the repo at `repo`, or of the repo that the app is in.
 * It's written, with what the build keeps to build faster, into a folder of
 * its own, so that a test's build leaves the app's own alone. Given such a
 * folder, it builds into it again.
 */
export async function buildSite(repo?: string, into?: string): Promise<Site> {
	const folder = into ?? (await siteFolder());
	const outDir = join(folder, "dist");
	if (repo !== undefined) {
		process.env.DOCS_REPO = repo;
	}
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
		again: () => buildSite(repo, folder),
	};
}

export interface DevelopedSite {
	/** The HTML of a page as the dev server sends it now, by its path on the site. */
	page(path: string): Promise<string>;
	/** Every folder and file that the dev server watches for changes. */
	watched(): string[];
	stop(): Promise<void>;
}

/**
 * Starts the site's dev server, as `astro dev` does, for the repo at `repo`,
 * on a port of its own. Its `stop` must be called before another site is
 * built or developed.
 */
export async function developSite(repo: string): Promise<DevelopedSite> {
	const folder = await siteFolder();
	process.env.DOCS_REPO = repo;
	// Astro's dev server answers no request when it finds that Vitest started it, so that
	// Vitest's own server can use Astro's plugins. Here it's the site's server that is wanted.
	const { VITEST } = process.env;
	delete process.env.VITEST;
	const server = await dev({
		root: app,
		cacheDir: join(folder, "cache"),
		logLevel: "silent",
		server: { port: 0 },
	})
		.catch((error: unknown) => {
			delete process.env.DOCS_REPO;
			throw error;
		})
		.finally(() => {
			if (VITEST !== undefined) {
				process.env.VITEST = VITEST;
			}
		});
	const [url = ""] = server.resolvedUrls.local;
	return {
		page: async (path) => (await fetch(new URL(`${path}/`, url))).text(),
		watched: () =>
			Object.entries(server.watcher.getWatched()).flatMap(([watchedFolder, names]) => [
				watchedFolder,
				...names.map((name) => join(watchedFolder, name)),
			]),
		stop: async () => {
			await server.stop();
			delete process.env.DOCS_REPO;
		},
	};
}
