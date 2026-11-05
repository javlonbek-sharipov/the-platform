import type { Page } from "playwright";
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
		"See [why a shopper has one cart](../../packages/shop/docs/adr/0001-one-cart-per-shopper.md#considered-options).",
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
		"### Shop",
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
		"",
		"The [glossary][shop] says what a cart is.",
		"",
		"[shop]: ../../GLOSSARY.md",
	),
	"packages/shop/docs/checkout.md": lines(
		"# Checkout",
		"",
		"The shop's web app places each order through the Checkout API.",
		"",
		"![Checkout](./checkout.diagram.svg)",
		"",
		"The Diagram above shows the call.",
		"It's written in [`checkout.diagram.ts`](./checkout.diagram.ts).",
	),
	"packages/shop/docs/checkout.diagram.svg": svg,
};

/** The text of each `<h1>` in a page's HTML. */
function headingsOf(page: string): string[] {
	return [...page.matchAll(/<h1[^>]*>([^<]*)<\/h1>/g)].map(([, text = ""]) => text.trim());
}

/** A page's sidebar: each link by its text, and each group as its label with what it holds. */
type Sidebar = (string | { [label: string]: Sidebar })[];

function sidebarOf(page: Page): Promise<Sidebar> {
	return page.getByRole("navigation", { name: "Main" }).evaluate((navigation) => {
		const read = (list: Element | null): Sidebar =>
			[...(list?.children ?? [])].map((item) => {
				const group = item.querySelector(":scope > details");
				const label = (group?.querySelector(":scope > summary") ?? item).textContent ?? "";
				const name = label.trim().replace(/\s+/g, " ");
				return group === null ? name : { [name]: read(group.querySelector(":scope > ul")) };
			});
		return read(navigation.querySelector("ul"));
	});
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
		expect((await node.boundingBox())?.width).toBeGreaterThan(0);
	});

	test("a Diagram is drawn in the site's theme, whatever the reader's system asks for", async () => {
		const drawn: Record<string, Buffer> = {};
		for (const system of ["light", "dark"] as const) {
			for (const theme of ["Light", "Dark"]) {
				const reader = await reading(site, { scheme: system });
				const page = await open(reader, "packages/shop/docs/checkout");
				// The site has the switch twice, once for narrow windows: the reader uses the one that shows.
				const themes = page.getByLabel("Select theme").filter({ visible: true });
				await themes.selectOption({ label: theme });
				// Zoomed out as far as it goes, the whole drawing is in view, with every color it has.
				const diagram = page.locator("platform-diagram");
				await diagram.click();
				for (let press = 0; press < 8; press++) {
					await page.keyboard.press("-");
				}
				drawn[`${theme} on a ${system} system`] = await diagram.screenshot();
				await reader.close();
			}
		}

		// The site's switch decides how a Diagram looks, and the two themes look different.
		expect(
			drawn["Light on a dark system"]?.equals(drawn["Light on a light system"] ?? Buffer.of()),
		).toBe(true);
		expect(
			drawn["Dark on a light system"]?.equals(drawn["Dark on a dark system"] ?? Buffer.of()),
		).toBe(true);
		expect(
			drawn["Light on a light system"]?.equals(drawn["Dark on a dark system"] ?? Buffer.of()),
		).toBe(false);
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

	test("the front page leads to every doc, grouped by where it lives", async () => {
		const page = await open(await reading(site), "");

		expect(await page.getByRole("heading", { level: 1 }).textContent()).toBe("the-platform");
		expect(await sidebarOf(page)).toEqual([
			{
				"the-platform": [
					"Glossary Map",
					{ ADRs: ["Write decisions down"] },
					{ Specs: ["Checkout v1"] },
				],
			},
			{ Shop: ["Glossary", { ADRs: ["Keep one cart per shopper"] }, "Checkout"] },
		]);
	});

	test("a doc's entry in the sidebar opens its page", async () => {
		const page = await open(await reading(site), "");

		await page
			.getByRole("navigation", { name: "Main" })
			.getByRole("link", { name: "Glossary", exact: true })
			.click();

		await page.getByRole("heading", { level: 1, name: "Shop" }).waitFor();
	});

	test("a heading keeps the anchor that GitHub gives it", async () => {
		const page = await open(await reading(site), "packages/shop/glossary");

		// On GitHub, the title is `#shop`, so the heading below it with the same words is `#shop-1`.
		const heading = page.getByRole("heading", { level: 3, name: "Shop" });
		expect(await heading.getAttribute("id")).toBe("shop-1");
	});

	test("a link from one doc to another opens that doc's page", async () => {
		const page = await open(await reading(site), "glossary-map");

		await page.getByRole("main").getByRole("link", { name: "Shop", exact: true }).click();

		await page.getByRole("heading", { level: 1, name: "Shop" }).waitFor();
	});

	test("a link to a heading of another doc opens its page at that heading", async () => {
		const page = await open(await reading(site), "docs/specs/checkout");

		await page.getByRole("link", { name: "why a shopper has one cart" }).click();

		await page.getByRole("heading", { level: 1, name: "Keep one cart per shopper" }).waitFor();
		expect(await page.locator(":target").textContent()).toContain("Considered Options");
	});

	test("a link written as a reference opens its doc's page too", async () => {
		const page = await open(
			await reading(site),
			"packages/shop/docs/adr/0001-one-cart-per-shopper",
		);

		await page.getByRole("main").getByRole("link", { name: "glossary", exact: true }).click();

		await page.getByRole("heading", { level: 1, name: "Shop" }).waitFor();
	});

	test("a link to a file that isn't a doc opens the file on GitHub", async () => {
		const page = await open(await reading(site), "packages/shop/docs/checkout");

		const link = page.getByRole("link", { name: "checkout.diagram.ts" });

		expect(await link.getAttribute("href")).toBe(
			"https://github.com/javlonbek-sharipov/the-platform/blob/main/packages/shop/docs/checkout.diagram.ts",
		);
	});
});
