import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { domain, render } from "@the-platform/diagrams";
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import billing from "../../../packages/diagrams/docs/example-billing.diagram.ts";
import { closeBrowser, open, reading } from "./support/browser.ts";
import { checkoutSvg, sampleRepo } from "./support/repo.ts";
import { buildSite, type DevelopedSite, developSite, type Site } from "./support/site.ts";

/** The lines of a Markdown file. */
const lines = (...text: string[]) => `${text.join("\n")}\n`;

const svg = checkoutSvg();
const aggregateSvg = render(billing).svg;
if (aggregateSvg === undefined) {
	throw new Error("the sample aggregate diagram has errors");
}

/** What every file of another project says, in the sample repo's `repos/`. */
const notOurs = "Not ours to show";
const theirs = (...text: string[]) => lines(...text, "", `${notOurs}.`);

/** A picture of one white pixel. */
const pixel = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
	"base64",
);

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
	"docs/.drafts/idea.md": lines("# An idea", "", "Not ready to show."),
	"docs/notes.md": lines("Remember to ask what a shopper pays with."),
	"docs/specs/checkout.md": lines(
		"# Checkout v1",
		"",
		"How a shopper pays for a cart.",
		"See [why a shopper has one cart](../../packages/shop/docs/adr/0001-one-cart-per-shopper.md#considered-options).",
		"",
		"The call, within a sentence: ![Checkout](../../packages/shop/docs/checkout.diagram.svg)",
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
	"packages/shop/docs/billing.md": lines(
		"# Billing",
		"",
		"![Billing aggregates](./billing.diagram.svg)",
	),
	"packages/shop/docs/billing.diagram.svg": aggregateSvg,
	"packages/shop/docs/logo.md": lines(
		"# Logo",
		"",
		"![The shop's logo](./logo.png)",
		"",
		"Each can be written as a reference too:",
		"",
		"![The logo again][logo]",
		"",
		"![Checkout][drawing]",
		"",
		"[logo]: ./logo.png",
		"[drawing]: ./checkout.diagram.svg",
	),
	"packages/shop/docs/logo.png": pixel,
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
		const repo = await sampleRepo(shop);
		// Links that lead from where our docs are into `repos/`: a folder of docs, a doc, and a package.
		await symlink("../repos/quorum/docs", join(repo, "docs/theirs"));
		await symlink("../repos/quorum/docs/board.md", join(repo, "docs/their-board.md"));
		await symlink("../repos/quorum", join(repo, "packages/quorum"));
		site = await buildSite(repo);
	}, 120_000);

	afterAll(closeBrowser);

	test("a page's Diagram image becomes the web component, with the SVG inline", async () => {
		const page = await site.page("packages/shop/docs/checkout");

		expect(page).toContain(
			`<platform-diagram data-diagram="packages/shop/docs/checkout">${svg}</platform-diagram>`,
		);
		// It stands on a line of its own in the doc, so it's a block of the page, not part of a paragraph.
		expect(page).not.toContain("<p><platform-diagram ");
		expect(page).not.toMatch(/<img[^>]*checkout\.diagram/);
	});

	test("a Diagram image within a sentence becomes the web component too, where it stands", async () => {
		const page = await site.page("docs/specs/checkout");

		expect(page).toContain(
			`The call, within a sentence: <platform-diagram data-diagram="packages/shop/docs/checkout">${svg}</platform-diagram>`,
		);
	});

	test("a Diagram image written as a reference becomes the web component too", async () => {
		const page = await site.page("packages/shop/docs/logo");

		expect(page).toContain(
			`<platform-diagram data-diagram="packages/shop/docs/checkout">${svg}</platform-diagram>`,
		);
	});

	test("a reader explores the Diagram where it's embedded", async () => {
		const page = await open(await reading(site), "packages/shop/docs/checkout");
		const node = page.getByText("Checkout API", { exact: true });
		const before = await node.boundingBox();

		// A Node click opens details; Escape returns focus to the drawing for camera keys.
		await node.click();
		expect(await page.getByRole("dialog", { name: "Checkout API details" }).isVisible()).toBe(true);
		await page.keyboard.press("Escape");
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

	test.each(["checkout", "billing"])(
		"%s is drawn in the site's theme, whatever the reader's system asks for",
		async (name) => {
			const drawn: Record<string, Buffer> = {};
			for (const system of ["light", "dark"] as const) {
				for (const theme of ["Light", "Dark"]) {
					const reader = await reading(site, { scheme: system });
					const page = await open(reader, `packages/shop/docs/${name}`);
					// The site has the switch twice, once for narrow windows: the reader uses the one that shows.
					const themes = page.getByLabel("Select theme").filter({ visible: true });
					await themes.selectOption({ label: theme });
					// Zoomed out as far as it goes, the whole drawing is in view, with every color it has.
					const diagram = page.locator("platform-diagram");
					// Compare themes on a still drawing: moving marks otherwise change the picture with time.
					await diagram.evaluate((element) => element.setAttribute("motion", "off"));
					// Camera input starts on empty space, so the picture contains only the drawing.
					await diagram.click({ position: { x: 4, y: 4 } });
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
		},
	);

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

	test("a doc without a heading is titled by its file's name", async () => {
		const page = await site.page("docs/notes");

		expect(headingsOf(page)).toEqual(["notes"]);
		expect(page).toContain("Remember to ask what a shopper pays with.");
	});

	test("a doc in a hidden folder isn't shown", async () => {
		expect(await site.filesWith("Not ready to show")).toEqual([]);
	});

	test("the front page leads to every doc, grouped by where it lives", async () => {
		const page = await open(await reading(site), "");

		expect(await page.getByRole("heading", { level: 1 }).textContent()).toBe("the-platform");
		expect(await sidebarOf(page)).toEqual([
			{
				"the-platform": [
					"Glossary Map",
					{ ADRs: ["Write decisions down"] },
					"notes",
					{ Specs: ["Checkout v1"] },
				],
			},
			{
				Shop: ["Glossary", { ADRs: ["Keep one cart per shopper"] }, "Billing", "Checkout", "Logo"],
			},
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
		// Written as a reference, it's the same picture.
		const again = page.getByRole("img", { name: "The logo again" });
		expect(await again.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1);
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

	test("every page leads to the repo on GitHub", async () => {
		const page = await open(await reading(site), "docs/specs/checkout");

		const link = page.getByRole("banner").getByRole("link", { name: "GitHub" });

		expect(await link.getAttribute("href")).toBe(
			"https://github.com/javlonbek-sharipov/the-platform",
		);
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

describe("a site that is built again", () => {
	afterAll(closeBrowser);

	test("still shows the picture of a doc that is as it was", async () => {
		const repo = await sampleRepo({
			"docs/logo.md": lines("# Logo", "", "![The shop's logo](./logo.png)"),
			"docs/logo.png": pixel,
		});
		const site = await (await buildSite(repo)).again();

		const page = await open(await reading(site), "docs/logo");

		const picture = page.getByRole("img", { name: "The shop's logo" });
		expect(await picture.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1);
	});

	test("shows a Diagram that was drawn again, though its doc is as it was", async () => {
		const repo = await sampleRepo({
			"docs/checkout.md": lines("# Checkout", "", "![Checkout](./checkout.diagram.svg)"),
			"docs/checkout.diagram.svg": svg,
		});
		const site = await buildSite(repo);
		expect(await site.page("docs/checkout")).toContain(">Checkout API</text>");

		await writeFile(
			join(repo, "docs/checkout.diagram.svg"),
			svg.replaceAll("Checkout API", "Payments API"),
		);

		expect(await (await site.again()).page("docs/checkout")).toContain(">Payments API</text>");
	});
});

describe("two docs that would be one page", () => {
	test("stop the build, which names them both", async () => {
		const repo = await sampleRepo({
			"docs/how to pay.md": lines("# How to pay"),
			"docs/how-to-pay.md": lines("# How to pay, again"),
		});

		await expect(buildSite(repo)).rejects.toThrow(
			"docs/how to pay.md and docs/how-to-pay.md would both be the page /docs/how-to-pay/. Rename one of them.",
		);
	});
});

describe("the docs site, while it's being developed", { timeout: 20_000 }, () => {
	let repo: string;
	let site: DevelopedSite;

	beforeAll(async () => {
		repo = await sampleRepo({
			"GLOSSARY-MAP.md": lines("# Glossary Map", "", "The shop has one context so far."),
			"docs/specs/checkout.md": lines("# Checkout v1", "", "Shoppers pay in cash."),
			"docs/specs/returns.md": lines("# Returns v1", "", "Shoppers send things back."),
			"packages/shop/docs/checkout.md": lines(
				"# Checkout",
				"",
				"![Checkout](./checkout.diagram.svg)",
			),
			"packages/shop/docs/checkout.diagram.svg": svg,
			"repos/quorum/docs/board.md": theirs("# Board"),
		});
		// A link from among our docs into `repos/` isn't followed there either.
		await symlink("../repos/quorum/docs", join(repo, "docs/theirs"));
		site = await developSite(repo);
	}, 120_000);

	afterAll(() => site?.stop());

	/**
	 * What the site shows, looked at again until it shows what's expected. The
	 * server learns of a changed file from the system, and writes what it loaded
	 * half a second later, so on a busy machine a change can take a few seconds.
	 */
	const soon = <T>(look: () => Promise<T>) => expect.poll(look, { timeout: 15_000, interval: 100 });

	test("shows a doc as it's edited", async () => {
		expect(await site.page("docs/specs/checkout")).toContain("Shoppers pay in cash.");

		await writeFile(
			join(repo, "docs/specs/checkout.md"),
			lines("# Checkout v1", "", "Shoppers pay by card."),
		);

		await soon(() => site.page("docs/specs/checkout")).toContain("Shoppers pay by card.");
	});

	test("shows a doc's new title, when only its heading is edited", async () => {
		await writeFile(
			join(repo, "docs/specs/returns.md"),
			lines("# Returns v2", "", "Shoppers send things back."),
		);

		await soon(async () => headingsOf(await site.page("docs/specs/returns"))).toEqual([
			"Returns v2",
		]);
	});

	test("shows a glossary as it's edited", async () => {
		await writeFile(
			join(repo, "GLOSSARY-MAP.md"),
			lines("# Glossary Map", "", "The shop has two contexts now."),
		);

		await soon(() => site.page("glossary-map")).toContain("The shop has two contexts now.");
	});

	test("shows a Diagram as it's drawn again", async () => {
		expect(await site.page("packages/shop/docs/checkout")).toContain(">Checkout API</text>");

		await writeFile(
			join(repo, "packages/shop/docs/checkout.diagram.svg"),
			svg.replaceAll("Checkout API", "Payments API"),
		);

		await soon(() => site.page("packages/shop/docs/checkout")).toContain(">Payments API</text>");
	});

	test("goes on after a doc breaks, and shows the doc once it's mended", async () => {
		const doc = join(repo, "docs/specs/checkout.md");
		await writeFile(doc, lines("# Checkout v1", "", "![Gone](./gone.diagram.svg)"));
		// Long enough for the server to have tried the broken doc.
		await new Promise((resolve) => setTimeout(resolve, 1_000));

		await writeFile(doc, lines("# Checkout v1", "", "Shoppers pay as they like."));

		await soon(() => site.page("docs/specs/checkout")).toContain("Shoppers pay as they like.");
	});

	test("watches the repo's docs, and nothing in repos/", () => {
		const watched = site.watched();

		expect(watched).toContain(join(repo, "docs/specs/checkout.md"));
		// Each is taken for where it really is, behind any link.
		const real = watched.filter(existsSync).map((path) => realpathSync(path));
		expect(real.filter((path) => path.startsWith(join(repo, "repos")))).toEqual([]);
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

		expect(page).toContain(
			`<platform-diagram data-diagram="packages/diagrams/docs/example-system">${drawing}</platform-diagram>`,
		);
	});
});

describe("Atlas navigation on the built site", () => {
	let site: Site;

	beforeAll(async () => {
		const overview = domain({ id: "packages/shop/docs/overview", title: "Shop overview" }, (d) => {
			d.node({
				id: "shop",
				kind: "context",
				title: "Shop",
				links: [
					{ term: "Cart" },
					{ id: "shop/order", label: "Order details" },
					{ doc: "docs/adr/0001-payments.md", label: "Payments decision" },
					{ doc: "docs/specs/payments.md", section: "Problem Statement", label: "Payment problem" },
					{
						doc: "docs/specs/payments.md",
						section: "problem-statement-1",
						label: "Second problem",
					},
					{ doc: "docs/specs/payments.md", section: "Payments v1", label: "Payment title" },
				],
			});
		});
		const drawing = render(overview).svg;
		if (drawing === undefined) throw new Error("the navigation Diagram has errors");
		const details = domain({ id: "packages/shop/docs/details", title: "Shop details" }, (d) => {
			d.group({ id: "shop", kind: "context", title: "Shop" }, (shop) => {
				shop.node({ id: "order", kind: "aggregate", title: "Order" });
				shop.node({ id: "paid", kind: "event", title: "Order paid", links: [{ term: "Cart" }] });
			});
		});
		const borrowed = domain(
			{ id: "packages/shop/docs/borrowed", title: "Billing details" },
			(d) => {
				d.node({ id: "shop/paid", kind: "event", title: "Order paid", links: [{ term: "Cart" }] });
				d.group({ id: "billing", kind: "context", title: "Billing" }, (billing) => {
					billing.node({ id: "invoice", kind: "aggregate", title: "Invoice" });
				});
			},
		);
		const detailFiles = Object.fromEntries(
			[details, borrowed].flatMap((diagram) => [
				[`${diagram.id}.diagram.ts`, `export default ${JSON.stringify(diagram)};`],
				[`${diagram.id}.diagram.svg`, render(diagram).svg ?? ""],
			]),
		);
		const repo = await sampleRepo({
			...detailFiles,
			"docs/adr/0001-payments.md": lines(
				"# Payments decision",
				"",
				"Keep the reason for accepting cash.",
			),
			"docs/specs/payments.md": lines(
				"# Payments v1",
				"",
				"## Problem Statement",
				"",
				"The first problem.",
				"",
				"## Problem Statement",
				"",
				"The second problem.",
			),
			"diagrams.config.ts":
				'export default { contexts: { shop: { glossary: "packages/shop/GLOSSARY.md" } } };',
			"packages/shop/GLOSSARY.md": lines(
				"# Shop",
				"",
				"## Cart",
				"",
				"A heading that already owns the cart anchor.",
				"",
				"**Cart**:",
				"What a shopper has **picked**, before placing an order.",
			),
			"packages/shop/docs/overview.diagram.ts": `export default ${JSON.stringify(overview)};`,
			"packages/shop/docs/overview.diagram.svg": drawing,
			"packages/shop/docs/overview.md": lines(
				"# Shop overview",
				"",
				"![Shop](./overview.diagram.svg)",
			),
			"packages/shop/docs/details.md": lines(
				"# Order details",
				"",
				"## Billing",
				"",
				"![Billing](./borrowed.diagram.svg)",
				"",
				"## Shop",
				"",
				"![Orders](./details.diagram.svg)",
			),
		});
		site = await buildSite(repo);
	}, 120_000);

	afterAll(closeBrowser);

	test("a Node's term hover uses the glossary definition indexed at build time", async () => {
		const reader = await reading(site);
		try {
			const page = await open(reader, "packages/shop/docs/overview");
			const diagram = page.locator("platform-diagram");
			await diagram.getByText("Shop", { exact: true }).hover();

			const definition = diagram.getByRole("tooltip").filter({ visible: true });
			await definition.waitFor();
			expect(await definition.textContent()).toContain(
				"What a shopper has **picked**, before placing an order.",
			);
		} finally {
			await reader.close();
		}
	});

	test("a term Link opens its glossary entry without taking a heading's anchor", async () => {
		const reader = await reading(site);
		try {
			const page = await open(reader, "packages/shop/docs/overview");
			await page.locator("platform-diagram").getByText("Shop", { exact: true }).click();
			await page
				.getByRole("dialog", { name: "Shop details" })
				.getByRole("button", { name: "Cart", exact: true })
				.click();

			await page.waitForURL("**/packages/shop/glossary/#cart-1");
			expect(await page.locator(":target").textContent()).toContain("Cart");
			expect(
				await page.getByRole("heading", { name: "Cart", exact: true }).getAttribute("id"),
			).toBe("cart");
		} finally {
			await reader.close();
		}
	});

	test.each([
		["Payments decision", "/docs/adr/0001-payments/", undefined],
		["Payment problem", "/docs/specs/payments/#problem-statement", "problem-statement"],
		["Second problem", "/docs/specs/payments/#problem-statement-1", "problem-statement-1"],
		["Payment title", "/docs/specs/payments/#_top", "_top"],
	])("a document Link to %s opens its page and heading", async (label, url, anchor) => {
		const reader = await reading(site);
		try {
			const page = await open(reader, "packages/shop/docs/overview");
			await page.locator("platform-diagram").getByText("Shop", { exact: true }).click();
			await page
				.getByRole("dialog", { name: "Shop details" })
				.getByRole("button", { name: label, exact: true })
				.click();

			await page.waitForURL(`**${url}`);
			if (anchor !== undefined)
				expect(await page.locator(":target").getAttribute("id")).toBe(anchor);
			expect(await page.getByRole("heading", { level: 1 }).textContent()).toBe(
				label === "Payments decision" ? "Payments decision" : "Payments v1",
			);
		} finally {
			await reader.close();
		}
	});

	test("drill-down opens the page and drawing that show a context as a Group", async () => {
		const reader = await reading(site);
		try {
			const page = await open(reader, "packages/shop/docs/overview");
			await page.locator("platform-diagram").getByText("Shop", { exact: true }).click();
			await page
				.getByRole("dialog", { name: "Shop details" })
				.getByRole("list", { name: "Drill down" })
				.getByRole("button", { name: "Shop details" })
				.click();

			await page.waitForURL(
				"**/packages/shop/docs/details/#diagram=packages%2Fshop%2Fdocs%2Fdetails",
			);
			const drawing = page.getByRole("group", { name: "Shop details", exact: true });
			await drawing.waitFor();
			expect((await drawing.boundingBox())?.y).toBeGreaterThanOrEqual(0);
			expect((await drawing.boundingBox())?.y).toBeLessThan(720);
		} finally {
			await reader.close();
		}
	});

	test("a direct Node URL selects the namespaced Node in its named Diagram", async () => {
		const reader = await reading(site);
		try {
			const page = await reader.newPage();
			await page.goto(
				"/packages/shop/docs/details/#diagram=packages%2Fshop%2Fdocs%2Fdetails&node=shop%2Fpaid",
			);
			const home = page.locator('platform-diagram[data-diagram="packages/shop/docs/details"]');
			const borrowed = page.locator('platform-diagram[data-diagram="packages/shop/docs/borrowed"]');
			const paid = (drawing: ReturnType<Page["locator"]>) =>
				drawing
					.getByRole("list", { name: "Nodes", exact: true })
					.getByRole("button", { name: "Order paid (event).", exact: true });

			await expect.poll(() => paid(home).getAttribute("aria-current")).toBe("true");
			expect(await paid(borrowed).getAttribute("aria-current")).toBe(null);
			expect(await page.getByRole("dialog").count()).toBe(0);
			expect((await home.boundingBox())?.y).toBeLessThan(720);
		} finally {
			await reader.close();
		}
	});

	test("an id Link opens a Diagram that draws the id and selects its Node", async () => {
		const reader = await reading(site);
		try {
			const page = await open(reader, "packages/shop/docs/overview");
			await page.locator("platform-diagram").getByText("Shop", { exact: true }).click();
			await page
				.getByRole("dialog", { name: "Shop details" })
				.getByRole("button", { name: "Order details", exact: true })
				.click();

			await page.waitForURL(
				"**/packages/shop/docs/details/#diagram=packages%2Fshop%2Fdocs%2Fdetails&node=shop%2Forder",
			);
			const drawing = page.locator('platform-diagram[data-diagram="packages/shop/docs/details"]');
			await expect
				.poll(() =>
					drawing
						.getByRole("button", { name: "Order (aggregate).", exact: true })
						.getAttribute("aria-current"),
				)
				.toBe("true");
		} finally {
			await reader.close();
		}
	});

	test("selecting a Node produces a shareable URL that restores selection after reload", async () => {
		const reader = await reading(site);
		try {
			const page = await open(reader, "packages/shop/docs/details");
			const drawing = page.locator('platform-diagram[data-diagram="packages/shop/docs/details"]');
			await drawing.getByText("Order", { exact: true }).click();

			expect(new URL(page.url()).hash).toBe(
				"#diagram=packages%2Fshop%2Fdocs%2Fdetails&node=shop%2Forder",
			);
			await page.reload();
			await expect
				.poll(() =>
					drawing
						.getByRole("button", { name: "Order (aggregate).", exact: true })
						.getAttribute("aria-current"),
				)
				.toBe("true");
			expect(await page.getByRole("dialog").count()).toBe(0);
		} finally {
			await reader.close();
		}
	});
});
