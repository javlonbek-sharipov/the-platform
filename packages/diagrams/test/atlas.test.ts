import { rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runCli, sampleAtlas, shopModule } from "./support/atlas.ts";

describe("the config", () => {
	test("marks the Atlas: without one, render and lint exit with 2 and say how to add it", async () => {
		const atlas = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });
		await rm(join(atlas, "diagrams.config.ts"));

		for (const command of ["render", "lint"]) {
			expect(await runCli([command], join(atlas, "docs"))).toEqual({
				code: 2,
				stdout: "",
				stderr:
					"There's no diagrams.config.ts in this folder or any folder above it. It marks the Atlas, so create it at the repo root:\n\n" +
					'  import { atlas } from "@the-platform/diagrams";\n\n' +
					"  export default atlas({});\n",
			});
		}
	});

	test("must default-export an Atlas config, which lint checks", async () => {
		const atlas = await sampleAtlas({
			"diagrams.config.ts": "export const contexts = {};\n",
			"docs/shop.diagram.ts": shopModule(),
		});
		expect((await runCli(["render"], atlas)).code).toBe(0);

		expect(await runCli(["lint"], atlas)).toEqual({
			code: 1,
			stdout:
				"diagrams.config.ts: error: The config doesn't default-export an Atlas config. Write `export default atlas({});`. (module-load)\n" +
				"Checked 1 Diagram: 1 error.\n",
			stderr: "",
		});
	});
});
