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

	test("an invalid Diagram gets no SVG, and the exit code is 1", async () => {
		const atlas = await sampleAtlas({
			"docs/broken.diagram.ts": shopModule().replace('kind: "service"', 'kind: "servce"'),
			"docs/shop.diagram.ts": shopModule(),
		});

		const render = await runCli(["render"], atlas);
		expect(render.code).toBe(1);
		expect(render.stdout).toBe(
			"docs/broken.diagram.ts: error: Node `shop-api` has the Kind `servce`, which the architecture Notation doesn't have. Its Node Kinds are person, system, client, gateway, service, worker, function, database, cache, queue, storage and search. (unknown-kind)\n" +
				"Wrote docs/shop.diagram.svg\n",
		);
		expect(existsSync(join(atlas, "docs/broken.diagram.svg"))).toBe(false);
		expect(existsSync(join(atlas, "docs/shop.diagram.svg"))).toBe(true);

		const lint = await runCli(["lint"], atlas);
		expect(lint.code).toBe(1);
		expect(lint.stdout).toMatch(/^docs\/broken\.diagram\.ts: error: .* \(unknown-kind\)\n/);
		expect(lint.stdout).toMatch(/\nChecked 2 Diagrams: 1 error\.\n$/);
	});

	test("finds Diagrams anywhere in the repo, except in .git, node_modules and repos", async () => {
		const unreachable = 'throw new Error("This module should never be loaded.");\n';
		const atlas = await sampleAtlas({
			".git/HEAD": "ref: refs/heads/main\n",
			".git/hooks/hook.diagram.ts": unreachable,
			"node_modules/some-lib/lib.diagram.ts": unreachable,
			"packages/app/node_modules/other-lib/lib.diagram.ts": unreachable,
			"repos/quorum/board.diagram.ts": unreachable,
			"docs/repos/clones.diagram.ts": shopModule("Clones"),
			"packages/app/app.diagram.ts": shopModule("App"),
		});

		expect(await runCli(["render"], join(atlas, "packages/app"))).toEqual({
			code: 0,
			stdout: "Wrote ../../docs/repos/clones.diagram.svg\nWrote app.diagram.svg\n",
			stderr: "",
		});
		expect(await runCli(["lint"], atlas)).toEqual({
			code: 0,
			stdout: "Checked 2 Diagrams: no errors.\n",
			stderr: "",
		});
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
