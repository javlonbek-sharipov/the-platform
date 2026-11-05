import { existsSync } from "node:fs";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { git, runCli, sampleAtlas, sampleConfig, shopModule } from "./support/atlas.ts";
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

	test("lint fails and names an SVG whose source is gone", async () => {
		const atlas = await sampleAtlas({
			"docs/shop.diagram.ts": shopModule("Shop"),
			"docs/stock.diagram.ts": shopModule("Stock"),
		});
		expect((await runCli(["render"], atlas)).code).toBe(0);

		await rm(join(atlas, "docs/stock.diagram.ts"));

		expect(await runCli(["lint"], atlas)).toEqual({
			code: 1,
			stdout:
				"docs/stock.diagram.svg: error: The SVG's source, `stock.diagram.ts`, isn't in the Atlas. Delete the SVG, or restore its source. (svg-orphaned)\n" +
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

	test("an option that the builder or the config doesn't know is an error at the call it's given to, so it never vanishes", async () => {
		const atlas = await sampleAtlas({
			"diagrams.config.ts": sampleConfig.replace("atlas({})", "atlas({ contexts: {} })"),
			"docs/shop.diagram.ts": shopModule().replace(
				'{ kind: "call" }',
				'{ kind: "call", lable: "Buys" }',
			),
		});

		const render = await runCli(["render"], atlas);
		expect(render).toEqual({
			code: 1,
			stdout:
				"diagrams.config.ts:3:16: error: The Atlas config has no option `contexts`. It has no options yet. (model-shape)\n" +
				"docs/shop.diagram.ts:6:4: error: An Edge has no option `lable`. Its options are `kind`, `id`, `label`, `technology` and `rate`. (model-shape)\n",
			stderr: "",
		});
		expect(existsSync(join(atlas, "docs/shop.diagram.svg"))).toBe(false);

		expect(await runCli(["lint"], atlas)).toEqual({
			code: 1,
			stdout:
				"diagrams.config.ts:3:16: error: The Atlas config has no option `contexts`. It has no options yet. (model-shape)\n" +
				"docs/shop.diagram.ts:6:4: error: An Edge has no option `lable`. Its options are `kind`, `id`, `label`, `technology` and `rate`. (model-shape)\n" +
				"Checked 1 Diagram: 2 errors.\n",
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

	test("lint --json prints the same messages as JSON, with the same exit code", async () => {
		const atlas = await sampleAtlas({
			"docs/broken.diagram.ts": shopModule().replace('kind: "service"', 'kind: "servce"'),
			"docs/shop.diagram.ts": shopModule(),
		});

		const lint = await runCli(["lint", "--json"], atlas);
		expect(lint).toMatchObject({ code: 1, stderr: "" });
		expect(JSON.parse(lint.stdout)).toEqual({
			diagrams: 2,
			errors: 2,
			warnings: 0,
			messages: [
				{
					file: "docs/broken.diagram.ts",
					line: 5,
					column: 16,
					severity: "error",
					rule: "unknown-kind",
					message:
						"Node `shop-api` has the Kind `servce`, which the architecture Notation doesn't have. Its Node Kinds are person, system, client, gateway, service, worker, function, database, cache, queue, storage and search.",
					pointer: "/nodes/1/kind",
				},
				{
					file: "docs/shop.diagram.svg",
					severity: "error",
					rule: "svg-missing",
					message: "The SVG is missing. Run `diagrams render`, and commit the SVG with its source.",
				},
			],
		});

		await rm(join(atlas, "docs/broken.diagram.ts"));
		expect((await runCli(["render"], atlas)).code).toBe(0);
		expect(await runCli(["lint", "--json"], join(atlas, "docs"))).toEqual({
			code: 0,
			stdout: '{\n  "diagrams": 1,\n  "errors": 0,\n  "warnings": 0,\n  "messages": []\n}\n',
			stderr: "",
		});
	});

	test("lint rejects an option it doesn't have, with exit code 2", async () => {
		const atlas = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });

		const lint = await runCli(["lint", "--jsno"], atlas);
		expect(lint).toMatchObject({ code: 2, stdout: "" });
		expect(lint.stderr).toMatch(/^Unknown option `--jsno`\.\n\nUsage: diagrams <command>/);
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

	test("render refuses a path that isn't a Diagram module in the Atlas, with exit code 2, and writes nothing", async () => {
		const folder = await sampleAtlas({
			"site/diagrams.config.ts": sampleConfig,
			"site/.gitignore": "drafts/\n",
			"site/docs/shop.diagram.ts": shopModule("Shop"),
			"site/docs/shop.ts": shopModule("Shop"),
			"site/drafts/stock.diagram.ts": shopModule("Stock"),
			"docs/outside.diagram.ts": shopModule("Outside"),
		});
		const atlas = join(folder, "site");
		git(atlas, "init", "-q");
		const cases: [path: string, message: string][] = [
			[
				"docs/shop.ts",
				"There's no Diagram at `docs/shop.ts`. Name one by its module's path, which ends in `.diagram.ts`, or name a folder to render every Diagram in it.",
			],
			[
				"docs/shops.diagram.ts",
				"There's no Diagram at `docs/shops.diagram.ts`. Name one by its module's path, which ends in `.diagram.ts`, or name a folder to render every Diagram in it.",
			],
			[
				"../docs/outside.diagram.ts",
				"`../docs/outside.diagram.ts` isn't in the Atlas: it lies outside the folder that holds `diagrams.config.ts`.",
			],
			[
				"../docs",
				"`../docs` isn't in the Atlas: it lies outside the folder that holds `diagrams.config.ts`.",
			],
			[
				"drafts/stock.diagram.ts",
				"`drafts/stock.diagram.ts` isn't in the Atlas, which leaves out the files that git ignores.",
			],
		];
		for (const [path, message] of cases) {
			expect(await runCli(["render", "docs/shop.diagram.ts", path], atlas), path).toEqual({
				code: 2,
				stdout: "",
				stderr: `${message}\n`,
			});
		}
		// The sample's own files, leaving out the engine that node_modules links to.
		const svgs = (await readdir(folder, { recursive: true })).filter(
			(file) => file.endsWith(".diagram.svg") && !file.startsWith("node_modules"),
		);
		expect(svgs).toEqual([]);
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
			/^docs\/offices\.diagram\.ts:4:4: warning: Node `translations`'s title is too wide for its Node, so it's shortened to `Internationaliz.*…`\. .* \(text-shortened\)$/m,
		);
		expect(lint.stdout).toMatch(
			/^docs\/offices\.diagram\.ts:5:4: warning: Node `tokyo`'s title has characters that the bundled font lacks: 東 \(U\+6771\) and 京 \(U\+4EAC\)\. .* \(glyph-missing\)$/m,
		);
		expect(lint.stdout).toMatch(/\nChecked 1 Diagram: no errors, 2 warnings\.\n$/);
	});

	test("lint warns at an Edge's line about a label too long for its run, and about one with no room beside a run of its own, and still passes", async () => {
		// The web app calls the gateway three ways, so three parallel Edges run
		// side by side, and the middle one's label has no room beside its run.
		const atlas = await sampleAtlas({
			"docs/sign-in.diagram.ts": `import { architecture } from "@the-platform/diagrams";

export default architecture({ title: "Sign-in" }, (d) => {
	const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
	const gateway = d.node({ id: "gateway", kind: "gateway", title: "Gateway" });
	const accounts = d.node({ id: "accounts-api", kind: "service", title: "Accounts API" });
	d.edge(web, gateway, { kind: "call", id: "sign-in", label: "Signs in" });
	d.edge(web, gateway, { kind: "call", id: "sign-out", label: "Signs out" });
	d.edge(web, gateway, { kind: "call", id: "refresh", label: "Refreshes" });
	d.edge(gateway, accounts, {
		kind: "call",
		label: "Checks every sign-in with the single sign-on of the company's identity provider",
	});
});
`,
		});
		expect((await runCli(["render"], atlas)).code).toBe(0);

		const lint = await runCli(["lint"], atlas);
		expect(lint.code).toBe(0);
		expect(lint.stdout).toMatch(
			/^docs\/sign-in\.diagram\.ts:7:4: warning: Edge `sign-in`'s label has no room beside any run of the Edge's own, .* \(label-placement\)$/m,
		);
		expect(lint.stdout).toMatch(
			/^docs\/sign-in\.diagram\.ts:10:4: warning: Edge `gateway->accounts-api`'s label is too long for its run, so it's shortened to `Checks every .*…`\. .* \(text-shortened\)$/m,
		);
		expect(lint.stdout).toMatch(/\nChecked 1 Diagram: no errors, 2 warnings\.\n$/);
	});
});

describe("diagrams lint --staged", () => {
	test("judges what's staged, so an SVG rendered but left unstaged beside its staged source fails", async () => {
		const atlas = await sampleAtlas({ "docs/shop.diagram.ts": shopModule("Shop") });
		git(atlas, "init", "-q");
		expect((await runCli(["render"], atlas)).code).toBe(0);
		git(atlas, "add", "-A");

		// Render the edit, then stage only the module.
		await writeFile(join(atlas, "docs/shop.diagram.ts"), shopModule("Store"));
		expect((await runCli(["render"], atlas)).code).toBe(0);
		git(atlas, "add", "docs/shop.diagram.ts");

		// The working tree agrees with itself, so plain lint can't see it.
		expect((await runCli(["lint"], atlas)).code).toBe(0);
		expect(await runCli(["lint", "--staged"], atlas)).toEqual({
			code: 1,
			stdout:
				"docs/shop.diagram.svg: error: The staged SVG doesn't match its staged source. Run `diagrams render`, and stage the SVG with its source. (svg-out-of-date)\n" +
				"Checked 1 Diagram: 1 error.\n",
			stderr: "",
		});

		git(atlas, "add", "docs/shop.diagram.svg");
		expect(await runCli(["lint", "--staged"], join(atlas, "docs"))).toEqual({
			code: 0,
			stdout: "Checked 1 Diagram: no errors.\n",
			stderr: "",
		});
	});

	test("judges staged sources and imports, not the working tree, and names files by their own paths", async () => {
		const atlas = await sampleAtlas({
			"docs/shop.diagram.ts": `import { architecture } from "@the-platform/diagrams";
import { api } from "./shared/nodes.ts";

export default architecture({ title: "Shop" }, (d) => {
	d.node(api);
});
`,
			"docs/shared/nodes.ts":
				'export const api = { id: "shop-api", kind: "service", title: "Shop API" } as const;\n',
			"docs/notes.diagram.ts": shopModule("Notes"),
		});
		git(atlas, "init", "-q");
		expect((await runCli(["render"], atlas)).code).toBe(0);
		// The notes stay unstaged, so they aren't part of what's committed.
		git(
			atlas,
			"add",
			"diagrams.config.ts",
			"package.json",
			"docs/shop.diagram.ts",
			"docs/shop.diagram.svg",
			"docs/shared/nodes.ts",
		);

		// An edit to what the Diagram imports, rendered but not staged, isn't
		// what's committed, and neither are the notes, which aren't staged at all.
		await writeFile(
			join(atlas, "docs/shared/nodes.ts"),
			'export const api = { id: "shop-api", kind: "service", title: "Store API" } as const;\n',
		);
		expect((await runCli(["render"], atlas)).code).toBe(0);
		expect(await runCli(["lint", "--staged", "--json"], atlas)).toEqual({
			code: 0,
			stdout: '{\n  "diagrams": 1,\n  "errors": 0,\n  "warnings": 0,\n  "messages": []\n}\n',
			stderr: "",
		});

		// Staging the import alone leaves the staged SVG behind it.
		git(atlas, "add", "docs/shared/nodes.ts");
		expect((await runCli(["lint", "--staged"], atlas)).stdout).toBe(
			"docs/shop.diagram.svg: error: The staged SVG doesn't match its staged source. Run `diagrams render`, and stage the SVG with its source. (svg-out-of-date)\nChecked 1 Diagram: 1 error.\n",
		);
		git(atlas, "add", "docs/shop.diagram.svg");
		expect((await runCli(["lint", "--staged"], atlas)).code).toBe(0);
	});

	test("needs a git repo", async () => {
		const atlas = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });

		expect(await runCli(["lint", "--staged"], atlas)).toEqual({
			code: 2,
			stdout: "",
			stderr: "`--staged` lints what git has staged, but the Atlas isn't in a git repo.\n",
		});
	});
});
