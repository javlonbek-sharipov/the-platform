import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runCli, sampleAtlas, shopModule } from "./support/atlas.ts";

describe("diagrams render and lint", () => {
	test("render writes each SVG next to its source, and lint passes afterwards", async () => {
		const atlas = await sampleAtlas({
			"docs/shop.diagram.ts": shopModule("Shop"),
			"services/billing/billing.diagram.ts": shopModule("Billing"),
		});

		const render = await runCli(["render"], atlas);
		expect(render).toEqual({
			code: 0,
			stdout: "Wrote docs/shop.diagram.svg\nWrote services/billing/billing.diagram.svg\n",
			stderr: "",
		});
		const shop = await readFile(join(atlas, "docs/shop.diagram.svg"), "utf8");
		expect(shop).toContain('<g data-node="shop-api" data-kind="service">');
		const billing = await readFile(join(atlas, "services/billing/billing.diagram.svg"), "utf8");
		expect(billing).toContain(">Billing API</text>");

		expect(await runCli(["lint"], atlas)).toEqual({
			code: 0,
			stdout: "Checked 2 Diagrams: no errors.\n",
			stderr: "",
		});
		expect(existsSync(join(atlas, "docs/shop.diagram.svg"))).toBe(true);
	});

	test("lint fails and names the stale SVG after its source is edited", async () => {
		const atlas = await sampleAtlas({
			"docs/shop.diagram.ts": shopModule("Shop"),
			"docs/billing.diagram.ts": shopModule("Billing"),
		});
		expect((await runCli(["render"], atlas)).code).toBe(0);

		await writeFile(join(atlas, "docs/shop.diagram.ts"), shopModule("Store"));

		expect(await runCli(["lint"], atlas)).toEqual({
			code: 1,
			stdout:
				"docs/shop.diagram.svg: error: The SVG no longer matches its source. Run `diagrams render`. (svg-out-of-date)\n" +
				"Checked 2 Diagrams: 1 error.\n",
			stderr: "",
		});
	});

	test("lint fails and names the missing SVG after it's deleted", async () => {
		const atlas = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });
		expect((await runCli(["render"], atlas)).code).toBe(0);

		await rm(join(atlas, "docs/shop.diagram.svg"));

		expect(await runCli(["lint"], atlas)).toEqual({
			code: 1,
			stdout:
				"docs/shop.diagram.svg: error: The SVG is missing. Run `diagrams render`, and commit the SVG with its source. (svg-missing)\n" +
				"Checked 1 Diagram: 1 error.\n",
			stderr: "",
		});
	});

	test("an invalid Diagram gets no SVG, the exit code is 1, and the error names the line", async () => {
		const atlas = await sampleAtlas({
			"docs/broken.diagram.ts": shopModule().replace('kind: "service"', 'kind: "servce"'),
			"docs/shop.diagram.ts": shopModule(),
		});

		const render = await runCli(["render"], atlas);
		expect(render.code).toBe(1);
		expect(render.stdout).toBe(
			"docs/broken.diagram.ts:5:16: error: Node `shop-api` has the Kind `servce`, which the architecture Notation doesn't have. Its Node Kinds are person, system, client, gateway, service, worker, function, database, cache, queue, storage and search. (unknown-kind)\n" +
				"Wrote docs/shop.diagram.svg\n",
		);
		expect(existsSync(join(atlas, "docs/broken.diagram.svg"))).toBe(false);
		expect(existsSync(join(atlas, "docs/shop.diagram.svg"))).toBe(true);

		const lint = await runCli(["lint"], atlas);
		expect(lint.code).toBe(1);
		expect(lint.stdout).toMatch(/^docs\/broken\.diagram\.ts:5:16: error: .* \(unknown-kind\)\n/);
		expect(lint.stdout).toMatch(/\nChecked 2 Diagrams: 1 error\.\n$/);
	});

	test("errors point at the line and column of the declaration they're about", async () => {
		const atlas = await sampleAtlas({
			"docs/shop.diagram.ts": shopModule().replace("d.edge(web, api", 'd.edge(web, "shop-apl"'),
		});

		expect(await runCli(["lint"], atlas)).toEqual({
			code: 1,
			stdout:
				"docs/shop.diagram.ts:6:4: error: Edge `web-app->shop-apl` ends at `shop-apl`, which isn't a Node on this Diagram. (edge-end)\n" +
				"Checked 1 Diagram: 1 error.\n",
			stderr: "",
		});
	});

	test("a module that throws, or doesn't default-export a Diagram, is an error that names its file", async () => {
		const atlas = await sampleAtlas({
			"docs/closed.diagram.ts":
				'const reason: string = "The shop is closed.";\nthrow new Error(reason);\n',
			"docs/empty.diagram.ts": "export const title = 'Shop';\n",
			"docs/shared.diagram.ts": 'import { api } from "./shared/nodes.ts";\nexport default api;\n',
			"docs/shared/nodes.ts": 'export const api = 1;\n\nthrow new TypeError("No API today.");\n',
			"docs/typo.diagram.ts": shopModule().replace('title: "Web app" }', 'title: "Web app" ]'),
		});

		const lint = await runCli(["lint"], atlas);
		expect(lint.code).toBe(1);
		const lines = lint.stdout.split("\n");
		expect(lines.slice(0, 3)).toEqual([
			"docs/closed.diagram.ts:2:7: error: The module failed to load: The shop is closed. (module-load)",
			"docs/empty.diagram.ts: error: The module doesn't default-export a Diagram. (module-load)",
			"docs/shared.diagram.ts: error: The module failed to load: docs/shared/nodes.ts:3:7: No API today. (module-load)",
		]);
		// Node words syntax errors itself, and gives no column.
		expect(lines[3]).toMatch(
			/^docs\/typo\.diagram\.ts:4: error: The module failed to load: .+ \(module-load\)$/,
		);
		expect(lines.slice(4)).toEqual(["Checked 4 Diagrams: 4 errors.", ""]);
	});

	test("render writes only the SVGs of the paths it's given", async () => {
		const atlas = await sampleAtlas({
			"docs/shop.diagram.ts": shopModule("Shop"),
			"docs/billing/billing.diagram.ts": shopModule("Billing"),
			"docs/billing/invoices.diagram.ts": shopModule("Invoices"),
		});

		expect(await runCli(["render", "docs/shop.diagram.ts", "docs/billing"], atlas)).toEqual({
			code: 0,
			stdout:
				"Wrote docs/shop.diagram.svg\nWrote docs/billing/billing.diagram.svg\nWrote docs/billing/invoices.diagram.svg\n",
			stderr: "",
		});
		await writeFile(join(atlas, "docs/shop.diagram.ts"), shopModule("Store"));
		await writeFile(join(atlas, "docs/billing/billing.diagram.ts"), shopModule("Accounts"));

		expect(await runCli(["render", "docs/shop.diagram.ts"], atlas)).toEqual({
			code: 0,
			stdout: "Wrote docs/shop.diagram.svg\n",
			stderr: "",
		});
		expect((await runCli(["lint"], atlas)).stdout).toContain(
			"docs/billing/billing.diagram.svg: error:",
		);
	});
});
