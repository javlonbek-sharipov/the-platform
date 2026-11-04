import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runCli, sampleAtlas, shopModule } from "./support/atlas.ts";
import { decodePng, pngSize } from "./support/png.ts";
import { parseSvg } from "./support/svg.ts";

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
});
