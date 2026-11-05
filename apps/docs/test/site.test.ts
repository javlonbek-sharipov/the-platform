import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { closeBrowser, open, reading } from "./support/browser.ts";
import { checkoutSvg, sampleRepo } from "./support/repo.ts";
import { buildSite, type DevelopedSite, developSite, type Site } from "./support/site.ts";

/** The lines of a Markdown file. */
const lines = (...text: string[]) => `${text.join("\n")}\n`;

const svg = checkoutSvg();

/** What every file of another project says, in the sample repo's `repos/`. */
const notOurs = "Not ours to show";
const theirs = (...text: string[]) => lines(...text, "", `${notOurs}.`);

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
		'A shopper who types "pay" -- or presses Enter -- gets nothing...',
		"",
		"```ts",
		"const paid: boolean = await checkout(cart);",
		"```",
		"",
		"```nginx",
		"server { listen 80; }",
		"```",
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
	"packages/shop/docs/logo.md": lines("# Logo", "", "![The shop's logo](./logo.png)"),
	// A picture of one white pixel.
	"packages/shop/docs/logo.png": Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
		"base64",
	),
	// Other projects' files, kept in `repos/` for reading, in every place where a doc of ours could be.
	"repos/GLOSSARY.md": theirs("# Theirs"),
	"repos/docs/notes.md": theirs("# Their notes"),
	"repos/quorum/GLOSSARY.md": theirs("# Quorum"),
	"repos/quorum/GLOSSARY-MAP.md": theirs("# Their glossary map"),
	"repos/quorum/docs/adr/0001-draw-on-a-canvas.md": theirs("# Draw on a canvas"),
	"repos/quorum/docs/board.md": theirs("# Board", "", "![Board](./board.diagram.svg)"),
	"repos/quorum/docs/board.diagram.svg": svg.replace(
		"<title>Checkout</title>",
		`<title>${notOurs}</title>`,
	),
	"repos/quorum/packages/board/GLOSSARY.md": theirs("# Their board"),
	"repos/quorum/packages/board/docs/routing.md": theirs("# Their routing"),
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
	let site: Site;

	beforeAll(async () => {
		site = await buildSite(await sampleRepo(shop));
	}, 120_000);

	afterAll(closeBrowser);

	test("a page's Diagram image becomes the web component, with the SVG inline", async () => {
		const page = await site.page("packages/shop/docs/checkout");

		expect(page).toContain(`<platform-diagram>${svg}</platform-diagram>`);
		// It stands on a line of its own in the doc, so it's a block of the page, not part of a paragraph.
		expect(page).not.toContain("<p><platform-diagram>");
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

	test("nothing in repos/ is shown, or kept", async () => {
		expect(existsSync(join(site.folder, "repos"))).toBe(false);
		expect(await site.filesWith(notOurs)).toEqual([]);
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
			{ Shop: ["Glossary", { ADRs: ["Keep one cart per shopper"] }, "Checkout", "Logo"] },
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

	test("a picture that isn't a Diagram shows as the image it is", async () => {
		const page = await open(await reading(site), "packages/shop/docs/logo");

		const picture = page.getByRole("img", { name: "The shop's logo" });
		expect(await picture.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1);
	});

	test("code is colored only in a language whose grammar has a permissive license", async () => {
		const page = await open(await reading(site), "docs/specs/checkout");
		/** How many colors a block of code is written in. */
		const colors = (code: string) =>
			page
				.locator("pre", { hasText: code })
				.evaluate(
					(block) =>
						new Set([...block.querySelectorAll("span")].map((span) => getComputedStyle(span).color))
							.size,
				);

		// TypeScript's grammar is MIT. Shiki's grammar for nginx is GPL-3.0, so the site leaves it out.
		expect(await colors("const paid: boolean")).toBeGreaterThan(1);
		expect(await colors("server { listen 80; }")).toBe(1);
	});

	test("a page says where its doc is edited: its file, on GitHub", async () => {
		const page = await open(await reading(site), "docs/specs/checkout");

		expect(await page.getByRole("link", { name: "Edit page" }).getAttribute("href")).toBe(
			"https://github.com/javlonbek-sharipov/the-platform/edit/main/docs/specs/checkout.md",
		);
	});

	test("a doc's punctuation shows as it's written, as on GitHub", async () => {
		const page = await open(await reading(site), "docs/specs/checkout");

		const written = 'A shopper who types "pay" -- or presses Enter -- gets nothing...';
		expect(await page.getByText(written).isVisible()).toBe(true);
	});

	test("a heading keeps the anchor that GitHub gives it", async () => {
		const page = await open(await reading(site), "packages/shop/glossary");

		// On GitHub, the title is `#shop`, so the heading below it with the same words is `#shop-1`.
		const heading = page.getByRole("heading", { level: 3, name: "Shop" });
		expect(await heading.getAttribute("id")).toBe("shop-1");
	});

	test("a heading has a link to itself, to send a teammate straight to it", async () => {
		const page = await open(await reading(site), "docs/specs/checkout");

		const link = page.getByRole("main").getByRole("link", { name: /Problem Statement/ });

		expect(await link.getAttribute("href")).toBe("#problem-statement");
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

describe("a doc that embeds a file it can't show", () => {
	test.each([
		[
			"a Diagram in repos/",
			"![Board](../repos/quorum/board.diagram.svg)",
			"docs/board.md embeds ../repos/quorum/board.diagram.svg, a file in repos/. The site shows nothing from repos/, which holds other projects' files.",
		],
		[
			"a picture in repos/",
			"![Logo](../repos/quorum/logo.png)",
			"docs/board.md embeds ../repos/quorum/logo.png, a file in repos/. The site shows nothing from repos/, which holds other projects' files.",
		],
		[
			"a Diagram that links into repos/",
			"![Board](./linked.diagram.svg)",
			"docs/board.md embeds ./linked.diagram.svg, a file in repos/. The site shows nothing from repos/, which holds other projects' files.",
		],
		[
			"a file outside the repo",
			"![Board](../../elsewhere/board.diagram.svg)",
			"docs/board.md embeds ../../elsewhere/board.diagram.svg, a file outside the repo. The site shows only the repo's own files.",
		],
		[
			"a Diagram that isn't drawn yet",
			"![Board](./board.diagram.svg)",
			"docs/board.md embeds ./board.diagram.svg, which doesn't exist. Run `pnpm exec diagrams render` to draw it.",
		],
	])("stops the build for %s, and says why", async (_what, image, message) => {
		const repo = await sampleRepo({
			"docs/board.md": lines("# Board", "", image),
			"repos/quorum/board.diagram.svg": svg,
			"repos/quorum/logo.png": "a picture",
		});
		await symlink("../repos/quorum/board.diagram.svg", join(repo, "docs/linked.diagram.svg"));

		await expect(buildSite(repo)).rejects.toThrow(message);
	});
});

describe("the docs site, while it's being developed", () => {
	let repo: string;
	let site: DevelopedSite;

	beforeAll(async () => {
		repo = await sampleRepo({
			"GLOSSARY-MAP.md": lines("# Glossary Map", "", "The shop has one context so far."),
			"docs/specs/checkout.md": lines("# Checkout v1", "", "Shoppers pay in cash."),
			"packages/shop/docs/checkout.md": lines(
				"# Checkout",
				"",
				"![Checkout](./checkout.diagram.svg)",
			),
			"packages/shop/docs/checkout.diagram.svg": svg,
			"repos/quorum/docs/board.md": theirs("# Board"),
		});
		site = await developSite(repo);
	}, 120_000);

	afterAll(() => site?.stop());

	test("shows a doc as it's edited", async () => {
		expect(await site.page("docs/specs/checkout")).toContain("Shoppers pay in cash.");

		await writeFile(
			join(repo, "docs/specs/checkout.md"),
			lines("# Checkout v1", "", "Shoppers pay by card."),
		);

		await expect.poll(() => site.page("docs/specs/checkout")).toContain("Shoppers pay by card.");
	});

	test("shows a glossary as it's edited", async () => {
		await writeFile(
			join(repo, "GLOSSARY-MAP.md"),
			lines("# Glossary Map", "", "The shop has two contexts now."),
		);

		await expect.poll(() => site.page("glossary-map")).toContain("The shop has two contexts now.");
	});

	test("shows a Diagram as it's drawn again", async () => {
		expect(await site.page("packages/shop/docs/checkout")).toContain(">Checkout API</text>");

		await writeFile(
			join(repo, "packages/shop/docs/checkout.diagram.svg"),
			svg.replaceAll("Checkout API", "Payments API"),
		);

		await expect
			.poll(() => site.page("packages/shop/docs/checkout"))
			.toContain(">Payments API</text>");
	});

	test("shows a doc that's added", async () => {
		await writeFile(
			join(repo, "docs/specs/refunds.md"),
			lines("# Refunds v1", "", "Shoppers get their money back."),
		);

		await expect
			.poll(() => site.page("docs/specs/refunds"))
			.toContain("Shoppers get their money back.");
	});

	test("watches the repo's docs, and nothing in repos/", () => {
		const watched = site.watched();

		expect(watched).toContain(join(repo, "docs/specs/checkout.md"));
		expect(watched.filter((path) => path.startsWith(join(repo, "repos")))).toEqual([]);
	});
});

describe("the docs site of the-platform", () => {
	/** The repo that this app is in. */
	const root = fileURLToPath(new URL("../../../", import.meta.url));
	let site: Site;

	beforeAll(async () => {
		site = await buildSite();
	}, 120_000);

	test("has a page for every glossary, ADR, spec and doc that git tracks", async () => {
		// The places where the repo keeps its docs: its own, and each package's and app's.
		const tracked = execFileSync(
			"git",
			[
				"ls-files",
				"--",
				"GLOSSARY-MAP.md",
				"GLOSSARY.md",
				"docs",
				...["apps", "packages"].flatMap((folder) => [
					`:(glob)${folder}/*/GLOSSARY.md`,
					`:(glob)${folder}/*/docs/**`,
				]),
			],
			{ cwd: root, encoding: "utf8" },
		);
		const docs = tracked.split("\n").filter((path) => path.endsWith(".md"));
		expect(docs).toContain("docs/specs/diagram-engine.md");
		expect(docs).toContain("packages/diagrams/GLOSSARY.md");
		expect(docs).toContain("packages/diagrams/docs/adr/0001-clean-room-diagram-engine.md");

		for (const doc of docs) {
			const [, title] = /^# (.+)$/m.exec(await readFile(join(root, doc), "utf8")) ?? [];
			const page = await site.page(doc.slice(0, -".md".length).toLowerCase());
			expect(headingsOf(page), doc).toEqual([title]);
		}
	});

	test("shows the example system's Diagram as it's committed, in the web component", async () => {
		const drawing = await readFile(
			join(root, "packages/diagrams/docs/example-system.diagram.svg"),
			"utf8",
		);

		const page = await site.page("packages/diagrams/docs/example-system");

		expect(page).toContain(`<platform-diagram>${drawing}</platform-diagram>`);
	});
});
