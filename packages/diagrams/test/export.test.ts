import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runCli, sampleAtlas, shopModule } from "./support/atlas.ts";
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
 * Where the dark pixels in a box of a light-themed PNG start and end along x,
 * in the SVG's units. The box is in the SVG's units too.
 */
function inkIn(
	png: Pixels,
	scale: number,
	box: { left: number; right: number; top: number; bottom: number },
): { left: number; right: number } {
	let left = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	for (let y = Math.floor(box.top * scale); y < Math.ceil(box.bottom * scale); y++) {
		for (let x = Math.floor(box.left * scale); x < Math.ceil(box.right * scale); x++) {
			const [red, green, blue] = png.at(x, y);
			if (red + green + blue < 3 * 128) {
				left = Math.min(left, x);
				right = Math.max(right, x + 1);
			}
		}
	}
	return { left: left / scale, right: right / scale };
}
