import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { closeBrowser, open, reading } from "./support/browser.ts";
import { checkoutSvg, sampleRepo } from "./support/repo.ts";
import { buildSite, type Site } from "./support/site.ts";

describe("the docs site of a sample repo", () => {
	const svg = checkoutSvg();
	let repo: Awaited<ReturnType<typeof sampleRepo>>;
	let site: Site;

	beforeAll(async () => {
		repo = await sampleRepo({
			"packages/shop/docs/checkout.md": [
				"# Checkout",
				"",
				"The shop's web app places each order through the Checkout API.",
				"",
				"![Checkout](./checkout.diagram.svg)",
				"",
				"The Diagram above shows the call.",
				"",
			].join("\n"),
			"packages/shop/docs/checkout.diagram.svg": svg,
		});
		site = await buildSite(repo.root);
	}, 120_000);

	afterAll(async () => {
		await closeBrowser();
		await site?.remove();
		await repo?.remove();
	});

	test("a page's Diagram image becomes the web component, with the SVG inline", async () => {
		const page = await site.page("packages/shop/docs/checkout");

		expect(page).toContain(`<platform-diagram>${svg}</platform-diagram>`);
		expect(page).not.toMatch(/<img[^>]*checkout\.diagram/);
	});

	test("a reader explores the Diagram where it's embedded", async () => {
		const page = await open(await reading(site), "packages/shop/docs/checkout");
		const node = page.getByText("Checkout API", { exact: true });
		const before = await node.boundingBox();

		// A click into the Diagram gives it the focus, and `+` then brings the drawing closer.
		await node.click();
		await page.keyboard.press("+");

		const after = await node.boundingBox();
		expect(after?.width).toBeCloseTo((before?.width ?? 0) * 1.25, 0);
	});
});
