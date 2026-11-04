import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "vitest";
import { sampleAtlas, shopModule } from "./support/atlas.ts";

const run = promisify(execFile);
const repo = fileURLToPath(new URL("../../../", import.meta.url));

/** The one test that runs the real binary; the others call the CLI function in-process. */
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
