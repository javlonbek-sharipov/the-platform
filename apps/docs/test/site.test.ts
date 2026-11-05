import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { closeBrowser, open, reading } from "./support/browser.ts";
import { checkoutSvg, sampleRepo } from "./support/repo.ts";
import { buildSite, type Site } from "./support/site.ts";

/** The lines of a Markdown file. */
const lines = (...text: string[]) => `${text.join("\n")}\n`;

const svg = checkoutSvg();

/** A sample repo, laid out as the-platform is: a shop, with one context. */
const shop = {
	"GLOSSARY-MAP.md": lines(
		"# Glossary Map",
		"",
		"The shop has one context so far.",
		"",
		"## Contexts",
		"",
		"- [Shop](./packages/shop/GLOSSARY.md): where shoppers fill carts and place orders",
	),
	"docs/adr/0001-write-decisions-down.md": lines(
		"# Write decisions down",
		"",
		"Every decision that is hard to reverse gets an ADR, so that the next person learns why.",
	),
	"docs/specs/checkout.md": lines(
		"# Checkout v1",
		"",
		"How a shopper pays for a cart.",
		"",
		"## Problem Statement",
		"",
		"Shoppers can fill a cart, but they can't pay for it.",
	),
	"packages/shop/GLOSSARY.md": lines(
		"# Shop",
		"",
		"The shop sells things to shoppers.",
		"",
		"## Language",
		"",
		"**Cart**:",
		"What a shopper has picked and not yet ordered.",
		"_Avoid_: basket",
	),
	"packages/shop/docs/adr/0001-one-cart-per-shopper.md": lines(
		"# Keep one cart per shopper",
		"",
		"A shopper has one cart at a time, so that an order always comes from one place.",
		"",
		"## Considered Options",
		"",
		"- **A cart per device**: rejected, because a shopper who changes device would lose it.",
	),
	"packages/shop/docs/checkout.md": lines(
		"# Checkout",
		"",
		"The shop's web app places each order through the Checkout API.",
		"",
		"![Checkout](./checkout.diagram.svg)",
		"",
		"The Diagram above shows the call.",
	),
	"packages/shop/docs/checkout.diagram.svg": svg,
};

/** The text of each `<h1>` in a page's HTML. */
function headingsOf(page: string): string[] {
	return [...page.matchAll(/<h1[^>]*>([^<]*)<\/h1>/g)].map(([, text = ""]) => text.trim());
}

describe("the docs site of a sample repo", () => {
	let repo: Awaited<ReturnType<typeof sampleRepo>>;
	let site: Site;

	beforeAll(async () => {
		repo = await sampleRepo(shop);
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

	test("without JavaScript, the drawing still shows", async () => {
		const reader = await reading(site, { javaScript: false });
		const page = await open(reader, "packages/shop/docs/checkout");

		const node = page.getByText("Checkout API", { exact: true });
		expect(await node.isVisible()).toBe(true);
		expect((await node.boundingBox())?.width).toBeGreaterThan(50);
	});

	test.each([
		["the glossary map", "glossary-map", "Glossary Map", "The shop has one context so far."],
		["a context's glossary", "packages/shop/glossary", "Shop", "The shop sells things"],
		[
			"a context's ADR",
			"packages/shop/docs/adr/0001-one-cart-per-shopper",
			"Keep one cart per shopper",
			"A shopper has one cart at a time",
		],
		[
			"an ADR that spans contexts",
			"docs/adr/0001-write-decisions-down",
			"Write decisions down",
			"Every decision that is hard to reverse gets an ADR",
		],
		["a spec", "docs/specs/checkout", "Checkout v1", "How a shopper pays for a cart."],
		[
			"a doc beside the code",
			"packages/shop/docs/checkout",
			"Checkout",
			"The Diagram above shows the call.",
		],
	])("%s has a page, titled by its first heading", async (_what, path, title, text) => {
		const page = await site.page(path);

		// Its heading is the page's title, and the page doesn't print it twice.
		expect(headingsOf(page)).toEqual([title]);
		expect(page).toContain(text);
	});
});
