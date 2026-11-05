/**
 * Reading a built site as a reader does: its pages in a real browser,
 * Playwright's Chromium, which gets every file straight from the folder the
 * site was built into, as a web server would send it.
 */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { type Browser, type BrowserContext, chromium, type Page } from "playwright";
import type { Site } from "./site.ts";

/** Where the browser finds the site. Nothing listens there: each request is answered from the site's folder. */
const origin = "http://docs.test";

let browser: Promise<Browser> | undefined;

/** Closes the browser, once a test file has finished with it. */
export async function closeBrowser(): Promise<void> {
	await (await browser)?.close();
	browser = undefined;
}

export interface Reader {
	/** Whether the reader's browser runs scripts. It does unless told otherwise. */
	javaScript?: boolean;
	/** The color scheme that the reader's system asks for. */
	scheme?: "light" | "dark";
}

/**
 * A reader's browser on a site: a fresh one, with nothing stored, which can
 * reach nothing but the site.
 */
export async function reading(site: Site, reader: Reader = {}): Promise<BrowserContext> {
	browser ??= chromium.launch();
	const context = await (await browser).newContext({
		baseURL: origin,
		javaScriptEnabled: reader.javaScript ?? true,
		colorScheme: reader.scheme ?? "light",
		viewport: { width: 1280, height: 720 },
	});
	await context.route("**/*", (route) => {
		const url = new URL(route.request().url());
		let file = join(site.folder, decodeURIComponent(url.pathname));
		if (existsSync(file) && statSync(file).isDirectory()) {
			file = join(file, "index.html");
		}
		if (url.origin !== origin || !existsSync(file)) {
			return route.fulfill({ status: 404, body: "Not found" });
		}
		return route.fulfill({ path: file });
	});
	return context;
}

/** Opens one of the site's pages, by its path on the site, and waits until it has loaded. */
export async function open(context: BrowserContext, path: string): Promise<Page> {
	const page = await context.newPage();
	await page.goto(`/${path}/`.replace(/\/+/g, "/"), { waitUntil: "load" });
	return page;
}
