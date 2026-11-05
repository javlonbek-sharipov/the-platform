import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import example from "../docs/example-system.diagram.ts";
import { git, runCli, sampleAtlas, sampleConfig, shopModule } from "./support/atlas.ts";
import { decodePng, type Pixels, pngSize } from "./support/png.ts";
import { descendants, type Element, parseSvg } from "./support/svg.ts";
import {
	advanceOf,
	bundledFont,
	characterMap,
	type FontFile,
	glyphHeader,
	unitsPerEm,
} from "./support/truetype.ts";

/** The width and height that an SVG's root element gives it. */
async function svgSize(file: string): Promise<{ width: number; height: number }> {
	const root = parseSvg(await readFile(file, "utf8"));
	return {
		width: Number(root.attributes.get("width")),
		height: Number(root.attributes.get("height")),
	};
}

describe("diagrams export --format png", () => {
	test("writes a PNG the size of the Diagram's SVG into the cache folder, and prints its absolute path", async () => {
		const atlas = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });
		expect((await runCli(["render"], atlas)).code).toBe(0);

		const png = join(atlas, ".diagrams-cache/export/docs/shop.light.png");
		expect(await runCli(["export", "docs/shop.diagram.ts", "--format", "png"], atlas)).toEqual({
			code: 0,
			stdout: `${png}\n`,
			stderr: "",
		});
		expect(pngSize(await readFile(png))).toEqual(
			await svgSize(join(atlas, "docs/shop.diagram.svg")),
		);
	});

	test("--scale multiplies the PNG's width and height, and names the file after the scale", async () => {
		const atlas = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });
		expect((await runCli(["render"], atlas)).code).toBe(0);
		const { width, height } = await svgSize(join(atlas, "docs/shop.diagram.svg"));

		const export2 = await runCli(
			["export", "docs/shop.diagram.ts", "--format", "png", "--scale", "2"],
			atlas,
		);
		expect(export2).toMatchObject({ code: 0, stderr: "" });
		expect(export2.stdout).toBe(
			`${join(atlas, ".diagrams-cache/export/docs/shop.light@2x.png")}\n`,
		);
		expect(pngSize(await readFile(export2.stdout.trim()))).toEqual({
			width: width * 2,
			height: height * 2,
		});

		const export15 = await runCli(
			["export", "docs/shop.diagram.ts", "--format", "png", "--scale=1.5"],
			atlas,
		);
		expect(export15.stdout).toBe(
			`${join(atlas, ".diagrams-cache/export/docs/shop.light@1.5x.png")}\n`,
		);
		expect(pngSize(await readFile(export15.stdout.trim()))).toEqual({
			width: width * 1.5,
			height: height * 1.5,
		});
	});

	test("--theme draws the light or the dark theme's colors, light by default", async () => {
		const atlas = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });
		/** Exports the Diagram, and reads the PNG's background just inside its corner. */
		const background = async (...options: string[]) => {
			const run = await runCli(
				["export", "docs/shop.diagram.ts", "--format", "png", ...options],
				atlas,
			);
			expect(run).toMatchObject({ code: 0, stderr: "" });
			return { file: run.stdout, color: decodePng(await readFile(run.stdout.trim())).at(2, 2) };
		};
		const folder = join(atlas, ".diagrams-cache/export/docs");

		// #ffffff and #0d1117, the background's light and dark fallbacks.
		expect(await background()).toEqual({
			file: `${folder}/shop.light.png\n`,
			color: [255, 255, 255, 255],
		});
		expect(await background("--theme", "light")).toEqual({
			file: `${folder}/shop.light.png\n`,
			color: [255, 255, 255, 255],
		});
		expect(await background("--theme", "dark")).toEqual({
			file: `${folder}/shop.dark.png\n`,
			color: [13, 17, 23, 255],
		});
	});

	test("draws each text in the SVG's own font, so that it spans what the SVG measured", async () => {
		// Inter's contextual alternates turn `->` into a narrower arrow. The SVG's
		// embedded font has none, so neither may the PNG.
		const atlas = await sampleAtlas({
			"docs/arrows.diagram.ts": `import { architecture } from "@the-platform/diagrams";

export default architecture({ title: "Arrows" }, (d) => {
	d.node({ id: "arrows", kind: "service", title: "a->b->c->d" });
	d.node({ id: "shop-api", kind: "service", title: "Shop API" });
});
`,
		});
		expect((await runCli(["render"], atlas)).code).toBe(0);
		const svg = parseSvg(await readFile(join(atlas, "docs/arrows.diagram.svg"), "utf8"));
		const scale = 4;
		const run = await runCli(
			["export", "docs/arrows.diagram.ts", "--format", "png", "--scale", String(scale)],
			atlas,
		);
		const png = decodePng(await readFile(run.stdout.trim()));

		const texts = descendants(svg).filter((element) => element.name === "text");
		expect(texts.map((text) => text.text)).toEqual(["a->b->c->d", "Shop API"]);
		const font = bundledFont("Inter-SemiBold.ttf");
		for (const text of texts) {
			expect(text.attributes.get("font-weight")).toBe("600");
			const expected = inkOf(text, font);
			const drawn = inkIn(png, scale, {
				left: expected.left - 4,
				right: expected.right + 4,
				top: Number(text.attributes.get("y")) - 9,
				bottom: Number(text.attributes.get("y")) + 9,
			});
			expect(Math.abs(drawn.left - expected.left), `${text.text}: left`).toBeLessThan(1);
			expect(Math.abs(drawn.right - expected.right), `${text.text}: right`).toBeLessThan(1);
		}
	});

	test("draws each text centered on its point, as the SVG's central baseline asks", async () => {
		// Inter's central baseline lies halfway up its capitals, so a text in
		// capitals is centered on its point.
		const atlas = await sampleAtlas({
			"docs/capitals.diagram.ts": `import { architecture } from "@the-platform/diagrams";

export default architecture({ title: "Capitals" }, (d) => {
	d.node({ id: "http-api", kind: "service", title: "HTTP API", rows: [{ name: "TLS", value: "ON" }] });
});
`,
		});
		expect((await runCli(["render"], atlas)).code).toBe(0);
		const svg = parseSvg(await readFile(join(atlas, "docs/capitals.diagram.svg"), "utf8"));
		const scale = 4;
		const run = await runCli(
			["export", "docs/capitals.diagram.ts", "--format", "png", "--scale", String(scale)],
			atlas,
		);
		const png = decodePng(await readFile(run.stdout.trim()));

		const texts = descendants(svg).filter((element) => element.name === "text");
		expect(texts.map((text) => text.text)).toEqual(["HTTP API", "TLS", "ON"]);
		for (const text of texts) {
			const weight = text.attributes.get("font-weight") === "600" ? "SemiBold" : "Regular";
			const { left, right } = inkOf(text, bundledFont(`Inter-${weight}.ttf`));
			const y = Number(text.attributes.get("y"));
			const drawn = inkIn(png, scale, {
				left: left - 4,
				right: right + 4,
				top: y - 12,
				bottom: y + 12,
			});
			expect(Math.abs((drawn.top + drawn.bottom) / 2 - y), text.text).toBeLessThan(0.5);
		}
	});
});

describe("diagrams export --format json", () => {
	test("writes the Diagram's model: the module's default export, with the id the Atlas gives it", async () => {
		const source = await readFile(new URL("../docs/example-system.diagram.ts", import.meta.url));
		const atlas = await sampleAtlas({ "docs/example.diagram.ts": source.toString() });

		const json = join(atlas, ".diagrams-cache/export/docs/example.json");
		expect(await runCli(["export", "docs/example.diagram.ts", "--format", "json"], atlas)).toEqual({
			code: 0,
			stdout: `${json}\n`,
			stderr: "",
		});
		expect(JSON.parse(await readFile(json, "utf8"))).toEqual({ ...example, id: "docs/example" });
	});
});

/** An overview that draws the shop as one `system` Node, beside the web app that calls it. */
const overviewModule = `import { architecture } from "@the-platform/diagrams";

export default architecture({ title: "Overview" }, (d) => {
	const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
	const shop = d.node({ id: "shop", kind: "system", title: "Shop" });
	d.edge(web, shop, { kind: "call" });
});
`;

/** The shop's own Diagram, which draws the same id as a Group around its API. */
const shopSystemModule = `import { architecture } from "@the-platform/diagrams";

export default architecture({ title: "Shop" }, (d) => {
	const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
	d.group({ id: "shop", kind: "system", title: "Shop" }, (shop) => {
		const api = shop.node({ id: "shop-api", kind: "service", title: "Shop API" });
		d.edge(web, api, { kind: "call" });
	});
});
`;

describe("diagrams export --index", () => {
	test("writes the Atlas index into the cache folder, and prints its absolute path: every Diagram, and every id with the Diagrams that draw it", async () => {
		const atlas = await sampleAtlas({
			"docs/overview.diagram.ts": overviewModule,
			"docs/shop/shop.diagram.ts": shopSystemModule,
		});

		const index = join(atlas, ".diagrams-cache/index.json");
		expect(await runCli(["export", "--index"], atlas)).toEqual({
			code: 0,
			stdout: `${index}\n`,
			stderr: "",
		});
		expect(JSON.parse(await readFile(index, "utf8"))).toEqual({
			diagrams: [
				{
					id: "docs/overview",
					title: "Overview",
					notation: "architecture",
					svg: "docs/overview.diagram.svg",
				},
				{
					id: "docs/shop/shop",
					title: "Shop",
					notation: "architecture",
					svg: "docs/shop/shop.diagram.svg",
				},
			],
			ids: {
				shop: {
					kind: "system",
					title: "Shop",
					asNode: ["docs/overview"],
					asGroup: ["docs/shop/shop"],
				},
				"shop-api": { kind: "service", title: "Shop API", asNode: ["docs/shop/shop"], asGroup: [] },
				"web-app": {
					kind: "client",
					title: "Web app",
					asNode: ["docs/overview", "docs/shop/shop"],
					asGroup: [],
				},
			},
			terms: [],
		});
	});

	test("--out names the file, from the working directory", async () => {
		const atlas = await sampleAtlas({ "docs/overview.diagram.ts": overviewModule });

		const index = join(atlas, "site/atlas.json");
		expect(
			await runCli(["export", "--index", "--out", "../site/atlas.json"], join(atlas, "docs")),
		).toEqual({ code: 0, stdout: `${index}\n`, stderr: "" });
		expect(JSON.parse(await readFile(index, "utf8"))).toMatchObject({
			diagrams: [{ id: "docs/overview" }],
		});
		expect(existsSync(join(atlas, ".diagrams-cache"))).toBe(false);
	});

	test("fails on an Atlas with errors, prints them, and writes nothing", async () => {
		const atlas = await sampleAtlas({
			"docs/broken.diagram.ts": shopModule().replace('kind: "service"', 'kind: "servce"'),
			"docs/overview.diagram.ts": overviewModule,
			"docs/shop/shop.diagram.ts": shopSystemModule.replace(
				'title: "Shop" }, (shop)',
				'title: "Shops" }, (shop)',
			),
		});

		const run = await runCli(["export", "--index"], atlas);
		expect(run).toMatchObject({ code: 1, stdout: "" });
		expect(run.stderr.split("\n")).toEqual([
			expect.stringMatching(/^docs\/broken\.diagram\.ts:5:16: error: .* \(unknown-kind\)$/),
			expect.stringMatching(
				/^docs\/overview\.diagram\.ts:5:17: error: Node `shop` has the title `Shop` here, .* \(title-conflict\)$/,
			),
			expect.stringMatching(
				/^docs\/shop\/shop\.diagram\.ts:5:4: error: Group `shop` has the title `Shops` here, .* \(title-conflict\)$/,
			),
			"",
		]);
		expect(existsSync(join(atlas, ".diagrams-cache"))).toBe(false);
	});

	test("rejects a Diagram or an option beside it, with exit code 2", async () => {
		const atlas = await sampleAtlas({ "docs/overview.diagram.ts": overviewModule });
		const cases: [args: string[], message: string][] = [
			[
				["docs/overview.diagram.ts"],
				"`--index` writes the Atlas index, so name no Diagram with it.",
			],
			[["--format", "json"], "Unknown option `--format`."],
		];
		for (const [args, message] of cases) {
			const run = await runCli(["export", "--index", ...args], atlas);
			expect(run, args.join(" ")).toMatchObject({ code: 2, stdout: "" });
			expect(run.stderr.split("\n").slice(0, 3), args.join(" ")).toEqual([
				message,
				"",
				"Usage: diagrams <command>",
			]);
		}
		expect(existsSync(join(atlas, ".diagrams-cache"))).toBe(false);
	});
});

describe("diagrams export, where it writes", () => {
	test("--out names the file, from the working directory, and the command prints its absolute path", async () => {
		const atlas = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });
		const docs = join(atlas, "docs");

		const png = join(atlas, "pictures/shop.png");
		expect(
			await runCli(
				["export", "shop.diagram.ts", "--format", "png", "--out", "../pictures/shop.png"],
				docs,
			),
		).toEqual({ code: 0, stdout: `${png}\n`, stderr: "" });
		expect(pngSize(await readFile(png)).width).toBeGreaterThan(0);

		const json = join(docs, "shop.json");
		expect(
			await runCli(["export", "shop.diagram.ts", "--format", "json", "--out=shop.json"], docs),
		).toEqual({ code: 0, stdout: `${json}\n`, stderr: "" });
		expect(JSON.parse(await readFile(json, "utf8"))).toMatchObject({
			id: "docs/shop",
			title: "Shop",
		});

		expect(existsSync(join(atlas, ".diagrams-cache"))).toBe(false);
	});

	test("git ignores the cache folder, even in a repo that doesn't ignore it", async () => {
		const atlas = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });
		git(atlas, "init", "-q");
		const untracked = () => git(atlas, "status", "--porcelain", "--untracked-files=all");
		const before = untracked();

		expect((await runCli(["export", "docs/shop.diagram.ts", "--format", "png"], atlas)).code).toBe(
			0,
		);
		expect((await runCli(["export", "docs/shop.diagram.ts", "--format", "json"], atlas)).code).toBe(
			0,
		);
		expect(existsSync(join(atlas, ".diagrams-cache/export/docs/shop.json"))).toBe(true);
		expect(untracked()).toBe(before);
	});
});

describe("diagrams export, with diagnostics", () => {
	test("fails on an invalid Diagram, prints its errors, and writes nothing", async () => {
		const atlas = await sampleAtlas({
			"docs/broken.diagram.ts": shopModule().replace('kind: "service"', 'kind: "servce"'),
		});

		for (const format of ["png", "json"]) {
			expect(await runCli(["export", "docs/broken.diagram.ts", "--format", format], atlas)).toEqual(
				{
					code: 1,
					stdout: "",
					stderr:
						"docs/broken.diagram.ts:5:16: error: Node `shop-api` has the Kind `servce`, which the architecture Notation doesn't have. Its Node Kinds are person, system, client, gateway, service, worker, function, database, cache, queue, storage and search. (unknown-kind)\n",
				},
			);
		}
		expect(existsSync(join(atlas, ".diagrams-cache"))).toBe(false);
	});

	test("prints a Diagram's warnings, and still exports it", async () => {
		const atlas = await sampleAtlas({
			"docs/offices.diagram.ts": `import { architecture } from "@the-platform/diagrams";

export default architecture({ title: "Offices" }, (d) => {
	d.node({ id: "translations", kind: "service", title: "Internationalization service" });
});
`,
		});

		const run = await runCli(["export", "docs/offices.diagram.ts", "--format", "png"], atlas);
		expect(run).toMatchObject({
			code: 0,
			stdout: `${join(atlas, ".diagrams-cache/export/docs/offices.light.png")}\n`,
		});
		expect(run.stderr).toMatch(
			/^docs\/offices\.diagram\.ts:4:4: warning: Node `translations`'s title is too wide for its Node, .* \(text-shortened\)\n$/,
		);
	});
});

describe("diagrams export, with arguments it can't use", () => {
	test("rejects them with exit code 2, says why, and writes nothing", async () => {
		const atlas = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });
		const shop = ["docs/shop.diagram.ts", "--format", "png"];
		const cases: [args: string[], message: string][] = [
			[[], "Name the Diagram to export by its module's path, such as `docs/shop.diagram.ts`."],
			[["docs/shop.diagram.ts"], "Choose a format: `--format png` or `--format json`."],
			[[...shop, "--format", "svg"], "Choose a format: `--format png` or `--format json`."],
			[[...shop, "--theme", "sepia"], "Choose a theme: `--theme light` or `--theme dark`."],
			...["0", "0.2", "8.5", "-1", "2x", "1e1", "two", ""].map((scale): [string[], string] => [
				[...shop, "--scale", scale],
				"`--scale` takes a number from 0.25 to 8, such as `2`.",
			]),
			[[...shop, "--size", "2"], "Unknown option `--size`."],
			[[...shop, "--out"], "The option `--out` needs a value."],
			[[...shop, "docs/other.diagram.ts"], "Export one Diagram at a time."],
		];
		for (const [args, message] of cases) {
			const run = await runCli(["export", ...args], atlas);
			expect(run, args.join(" ")).toMatchObject({ code: 2, stdout: "" });
			expect(run.stderr.split("\n").slice(0, 3), args.join(" ")).toEqual([
				message,
				"",
				"Usage: diagrams <command>",
			]);
		}
		expect(existsSync(join(atlas, ".diagrams-cache"))).toBe(false);
	});

	test("rejects an --out it can't write, with exit code 2", async () => {
		const atlas = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });

		const run = await runCli(
			["export", "docs/shop.diagram.ts", "--format", "png", "--out", "docs"],
			atlas,
		);
		expect(run).toMatchObject({ code: 2, stdout: "" });
		expect(run.stderr).toMatch(/^Couldn't write `docs`: EISDIR: .+\n$/);
	});

	test("rejects a Diagram that isn't there, with exit code 2", async () => {
		const atlas = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });

		expect(await runCli(["export", "docs/shops.diagram.ts", "--format", "png"], atlas)).toEqual({
			code: 2,
			stdout: "",
			stderr:
				"There's no Diagram at `docs/shops.diagram.ts`. Name one by its module's path, which ends in `.diagram.ts`.\n",
		});
	});

	test("rejects a Diagram outside the Atlas, whose id would lead out of the cache folder", async () => {
		const folder = await sampleAtlas({
			"site/diagrams.config.ts": sampleConfig,
			"docs/shop.diagram.ts": shopModule(),
		});

		expect(
			await runCli(["export", "../docs/shop.diagram.ts", "--format", "png"], join(folder, "site")),
		).toEqual({
			code: 2,
			stdout: "",
			stderr:
				"`../docs/shop.diagram.ts` isn't in the Atlas: it lies outside the folder that holds `diagrams.config.ts`.\n",
		});
	});
});

/**
 * Where a text's ink starts and ends along x, in the SVG's units, as Inter
 * draws it without kerning or alternates: centered on the text's point, from
 * the first glyph's left edge to the last one's right edge.
 */
function inkOf(text: Element, font: FontFile): { left: number; right: number } {
	const perUnit = Number(text.attributes.get("font-size")) / unitsPerEm(font);
	const characters = characterMap(font);
	const glyphs = [...text.text].map((character) => characters.get(character.codePointAt(0) ?? 0));
	const advances = glyphs.map((glyph) => advanceOf(font, glyph ?? 0));
	const width = advances.reduce((sum, advance) => sum + advance, 0);
	const [, firstLeft = 0] = glyphHeader(font, glyphs[0] ?? 0);
	const [, , , lastRight = 0] = glyphHeader(font, glyphs.at(-1) ?? 0);
	const start = Number(text.attributes.get("x")) - (width * perUnit) / 2;
	return {
		left: start + firstLeft * perUnit,
		right: start + (width - (advances.at(-1) ?? 0) + lastRight) * perUnit,
	};
}

/**
 * Where the dark pixels in a box of a light-themed PNG start and end, in the
 * SVG's units. The box is in the SVG's units too.
 */
function inkIn(png: Pixels, scale: number, box: Bounds): Bounds {
	const ink = {
		left: Number.POSITIVE_INFINITY,
		right: Number.NEGATIVE_INFINITY,
		top: Number.POSITIVE_INFINITY,
		bottom: Number.NEGATIVE_INFINITY,
	};
	for (let y = Math.floor(box.top * scale); y < Math.ceil(box.bottom * scale); y++) {
		for (let x = Math.floor(box.left * scale); x < Math.ceil(box.right * scale); x++) {
			const [red, green, blue] = png.at(x, y);
			if (red + green + blue < 3 * 128) {
				ink.left = Math.min(ink.left, x / scale);
				ink.right = Math.max(ink.right, (x + 1) / scale);
				ink.top = Math.min(ink.top, y / scale);
				ink.bottom = Math.max(ink.bottom, (y + 1) / scale);
			}
		}
	}
	return ink;
}

interface Bounds {
	left: number;
	right: number;
	top: number;
	bottom: number;
}
