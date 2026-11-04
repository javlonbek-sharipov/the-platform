import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "vitest";
import { sampleAtlas, shopModule } from "./support/atlas.ts";
import { pngSize } from "./support/png.ts";

const run = promisify(execFile);
const repo = fileURLToPath(new URL("../../../", import.meta.url));

// These tests run the real binary; the others call the CLI function in-process.

test("the diagrams binary renders and lints a sample Atlas, with the right exit codes", async () => {
	const atlas = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });
	const diagrams = join(repo, "node_modules", ".bin", "diagrams");

	expect(await run(diagrams, ["render"], { cwd: atlas })).toEqual({
		stdout: "Wrote docs/shop.diagram.svg\n",
		stderr: "",
	});
	expect(await run(diagrams, ["lint"], { cwd: atlas })).toEqual({
		stdout: "Checked 1 Diagram: no errors.\n",
		stderr: "",
	});

	await rm(join(atlas, "docs/shop.diagram.svg"));
	await expect(run(diagrams, ["lint"], { cwd: atlas })).rejects.toMatchObject({
		code: 1,
		stdout: expect.stringContaining("docs/shop.diagram.svg: error:"),
	});
});

test("the diagrams binary exports a PNG, and prints its path", async () => {
	const atlas = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });
	const diagrams = join(repo, "node_modules", ".bin", "diagrams");

	const png = join(atlas, ".diagrams-cache/export/docs/shop.dark@2x.png");
	const args = ["export", "docs/shop.diagram.ts", "--format", "png", "--theme", "dark"];
	expect(await run(diagrams, [...args, "--scale", "2"], { cwd: atlas })).toEqual({
		stdout: `${png}\n`,
		stderr: "",
	});
	expect(pngSize(await readFile(png)).width).toBeGreaterThan(0);
});
