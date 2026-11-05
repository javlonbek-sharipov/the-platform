import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { runCli, sampleAtlas } from "./support/atlas.ts";
import { schemaErrors } from "./support/schema.ts";

test("an Atlas renders, lints and exports Walkthroughs, and locates a broken Step at its declaration", async () => {
	const source = await readFile(
		new URL("../docs/example-walkthrough.diagram.ts", import.meta.url),
		"utf8",
	);
	const atlas = await sampleAtlas({ "docs/checkout.diagram.ts": source });
	expect((await runCli(["render"], atlas)).code).toBe(0);
	const lint = await runCli(["lint", "--json"], atlas);
	expect(lint.code).toBe(0);
	expect(JSON.parse(lint.stdout).messages).toEqual([]);
	const exported = await runCli(["export", "docs/checkout.diagram.ts", "--format", "json"], atlas);
	expect(exported.code).toBe(0);
	const model = JSON.parse(await readFile(exported.stdout.trim(), "utf8"));
	expect(model.id).toBe("docs/checkout");
	expect(model.walkthroughs).toEqual([
		{
			id: "place-order",
			title: "Place an order",
			steps: [
				{ edges: ["save"], note: "Save the order." },
				{ edges: [{ edge: "save", back: true }], note: "Return its id." },
				{ edges: ["save", "charge"], note: "Save and charge together." },
				{ node: "walkthrough-api", note: "Order placed." },
			],
		},
	]);
	expect(schemaErrors(model)).toEqual([]);
	await writeFile(
		join(atlas, "docs/checkout.diagram.ts"),
		source.replace("edges: [save]", 'edges: ["missing"]'),
	);
	const broken = await runCli(["lint", "--json"], atlas);
	expect(broken.code).toBe(1);
	expect(JSON.parse(broken.stdout).messages).toEqual([
		expect.objectContaining({
			file: "docs/checkout.diagram.ts",
			line: 10,
			column: 4,
			rule: "walkthrough-target",
			pointer: "/walkthroughs/0/steps/0/edges/0",
			message: expect.stringContaining("Edge `missing`"),
		}),
	]);
});
