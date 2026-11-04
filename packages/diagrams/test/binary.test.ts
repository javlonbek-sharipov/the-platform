import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { sampleAtlas, shopModule } from "./support/atlas.ts";

const run = promisify(execFile);
const repo = fileURLToPath(new URL("../../../", import.meta.url));

describe("the diagrams binary", () => {
	test("renders a sample Atlas, then lints it clean", async () => {
		const atlas = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });
		const diagrams = join(repo, "node_modules", ".bin", "diagrams");

		const render = await run(diagrams, ["render"], { cwd: atlas });
		expect(render).toEqual({ stdout: "Wrote docs/shop.diagram.svg\n", stderr: "" });
		expect(existsSync(join(atlas, "docs/shop.diagram.svg"))).toBe(true);

		const lint = await run(diagrams, ["lint"], { cwd: atlas });
		expect(lint).toEqual({ stdout: "Checked 1 Diagram: no errors.\n", stderr: "" });
	});

	test("exits with 1 when lint finds an error", async () => {
		const atlas = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });
		const diagrams = join(repo, "node_modules", ".bin", "diagrams");

		await expect(run(diagrams, ["lint"], { cwd: atlas })).rejects.toMatchObject({
			code: 1,
			stdout: expect.stringContaining("(svg-missing)"),
		});
	});
});
