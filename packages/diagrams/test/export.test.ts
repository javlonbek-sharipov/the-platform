import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runCli, sampleAtlas, shopModule } from "./support/atlas.ts";
import { readPng } from "./support/png.ts";
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
		expect(readPng(await readFile(png))).toEqual(
			await svgSize(join(atlas, "docs/shop.diagram.svg")),
		);
	});
});
