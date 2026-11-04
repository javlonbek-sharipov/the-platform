import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runCli, sampleAtlas, shopModule } from "./support/atlas.ts";
import { embeddedFaces } from "./support/fonts.ts";
import { characterMap, openFont } from "./support/truetype.ts";

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

describe("diagrams render and lint, with text", () => {
	test("render embeds in each SVG the bundled font's glyphs for exactly the characters it draws", async () => {
		const atlas = await sampleAtlas({ "docs/shop.diagram.ts": shopModule("Shop") });
		expect((await runCli(["render"], atlas)).code).toBe(0);

		const svg = await readFile(join(atlas, "docs/shop.diagram.svg"), "utf8");
		const faces = embeddedFaces(svg);
		expect(faces.map((face) => face.weight)).toEqual([600]);
		const codes = [...characterMap(openFont(faces[0]?.data ?? new Uint8Array())).keys()];
		// The characters of "Web app" and "Shop API".
		expect(String.fromCodePoint(...codes.sort((a, b) => a - b))).toBe(" AIPSWabehop");
	});

	test("lint warns about a shortened title and about characters the font lacks, and still passes", async () => {
		const atlas = await sampleAtlas({
			"docs/offices.diagram.ts": `import { architecture } from "@the-platform/diagrams";

export default architecture({ title: "Offices" }, (d) => {
	d.node({ id: "translations", kind: "service", title: "Internationalization service" });
	d.node({ id: "tokyo", kind: "service", title: "Tokyo 東京" });
});
`,
		});
		expect((await runCli(["render"], atlas)).code).toBe(0);

		const lint = await runCli(["lint"], atlas);
		expect(lint.code).toBe(0);
		expect(lint.stdout).toMatch(
			/^docs\/offices\.diagram\.ts(:\d+:\d+)?: warning: Node `translations`'s title is too wide for its Node, so it's shortened to `Internationaliz.*…`\. .* \(text-shortened\)$/m,
		);
		expect(lint.stdout).toMatch(
			/^docs\/offices\.diagram\.ts(:\d+:\d+)?: warning: Node `tokyo`'s title has characters that the bundled font lacks: 東 \(U\+6771\) and 京 \(U\+4EAC\)\. .* \(glyph-missing\)$/m,
		);
		expect(lint.stdout).toMatch(/\nChecked 1 Diagram: no errors, 2 warnings\.\n$/);
	});
});
