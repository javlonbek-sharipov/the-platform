import { afterAll, beforeAll, describe, expect, test } from "vitest";
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
		await site?.remove();
		await repo?.remove();
	});

	test("a page's Diagram image becomes the web component, with the SVG inline", async () => {
		const page = await site.page("packages/shop/docs/checkout");

		expect(page).toContain(`<platform-diagram>${svg}</platform-diagram>`);
		expect(page).not.toMatch(/<img[^>]*checkout\.diagram/);
	});
});
