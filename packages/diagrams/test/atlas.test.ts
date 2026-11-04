import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { git, runCli, sampleAtlas, sampleConfig, shopModule } from "./support/atlas.ts";

/** A module that fails if anything loads it. */
const unreachable = 'throw new Error("This module should never be loaded.");\n';

interface SampleNode {
	id: string;
	kind: string;
	title: string;
	links?: object[];
}

/** A diagram module that declares one Node per line: the first on line 4, each at column 4. */
function diagramModule(title: string, nodes: SampleNode[]): string {
	return `import { architecture } from "@the-platform/diagrams";

export default architecture({ title: ${JSON.stringify(title)} }, (d) => {
${nodes.map((node) => `\td.node(${JSON.stringify(node)});`).join("\n")}
});
`;
}

const paymentsApi = { id: "payments-api", kind: "service", title: "Payments API" };

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

describe("discovery", () => {
	test("in a git repo, finds every Diagram that git doesn't ignore, tracked or not", async () => {
		const atlas = await sampleAtlas({
			".gitignore": "node_modules/\nrepos/\n*.local.diagram.ts\n",
			"repos/quorum/board.diagram.ts": unreachable,
			"repos/quorum/orphan.diagram.svg": "<svg/>\n",
			"docs/draft.local.diagram.ts": unreachable,
			"docs/shop.diagram.ts": shopModule("Shop"),
			"docs/gone.diagram.ts": unreachable,
			"packages/app/app.diagram.ts": shopModule("App"),
		});
		git(atlas, "init", "-q");
		git(atlas, "add", "docs/shop.diagram.ts", "docs/gone.diagram.ts");
		await rm(join(atlas, "docs/gone.diagram.ts"));

		expect(await runCli(["render"], join(atlas, "packages/app"))).toEqual({
			code: 0,
			stdout: "Wrote ../../docs/shop.diagram.svg\nWrote app.diagram.svg\n",
			stderr: "",
		});
		expect(await runCli(["lint"], atlas)).toEqual({
			code: 0,
			stdout: "Checked 2 Diagrams: no errors.\n",
			stderr: "",
		});
	});

	test("outside a git repo, walks every folder except node_modules", async () => {
		const atlas = await sampleAtlas({
			"node_modules/some-lib/lib.diagram.ts": unreachable,
			"node_modules/some-lib/orphan.diagram.svg": "<svg/>\n",
			"packages/app/node_modules/other-lib/lib.diagram.ts": unreachable,
			"repos/clone/clone.diagram.ts": shopModule("Clone"),
			"packages/app/app.diagram.ts": shopModule("App"),
		});

		expect(await runCli(["render"], atlas)).toEqual({
			code: 0,
			stdout: "Wrote packages/app/app.diagram.svg\nWrote repos/clone/clone.diagram.svg\n",
			stderr: "",
		});
		expect(await runCli(["lint"], join(atlas, "repos"))).toEqual({
			code: 0,
			stdout: "Checked 2 Diagrams: no errors.\n",
			stderr: "",
		});
	});
});

describe("Links", () => {
	test("lint reports a Link to an id that no Diagram draws", async () => {
		const atlas = await sampleAtlas({
			"docs/payments.diagram.ts": diagramModule("Payments", [paymentsApi]),
			"docs/shop.diagram.ts": diagramModule("Shop", [
				{
					id: "shop-api",
					kind: "service",
					title: "Shop API",
					links: [{ id: "payments-api" }, { id: "paymnts-api", label: "Payments" }],
				},
			]),
		});
		expect((await runCli(["render"], atlas)).code).toBe(0);

		expect(await runCli(["lint"], atlas)).toEqual({
			code: 1,
			stdout:
				"docs/shop.diagram.ts:4:4: error: Node `shop-api` has a Link to `paymnts-api`, which no Diagram in the Atlas draws. (broken-link)\n" +
				"Checked 2 Diagrams: 1 error.\n",
			stderr: "",
		});
	});

	test("lint reports a Link to a document that isn't in the repo, or to a heading it doesn't have", async () => {
		const pricing = "docs/adr/0001-price-in-cents.md";
		const atlas = await sampleAtlas({
			[pricing]:
				"# Price in cents\n\nPrices are whole numbers of cents.\n\n" +
				"## Considered Options ##\n\n```md\n## Inside a fence\n```\n",
			"docs/shop.md": "# The shop\n\n### Check out, step by step\n\n### Check out, step by step\n",
			"docs/shop.diagram.ts": diagramModule("Shop", [
				{
					id: "shop-api",
					kind: "service",
					title: "Shop API",
					links: [
						{ doc: pricing },
						{ doc: pricing, section: "Considered Options" },
						{ doc: pricing, section: "considered-options" },
						{ doc: "docs/shop.md", section: "check-out-step-by-step-1" },
						{ doc: "docs/adr/0002-price-in-dollars.md" },
						{ doc: "docs/adr" },
						{ doc: pricing, section: "Inside a fence" },
						{ doc: "docs/shop.md", section: "Paying" },
					],
				},
			]),
		});
		expect((await runCli(["render"], atlas)).code).toBe(0);

		const at = "docs/shop.diagram.ts:4:4: error: Node `shop-api` has a Link to";
		expect(await runCli(["lint"], atlas)).toEqual({
			code: 1,
			stdout:
				`${at} \`docs/adr/0002-price-in-dollars.md\`, which isn't a file in the repo. (broken-link)\n` +
				`${at} \`docs/adr\`, which isn't a file in the repo. (broken-link)\n` +
				`${at} \`${pricing}\`, which has no heading \`Inside a fence\`. (broken-link)\n` +
				`${at} \`docs/shop.md\`, which has no heading \`Paying\`. (broken-link)\n` +
				"Checked 1 Diagram: 4 errors.\n",
			stderr: "",
		});
	});

	test("lint reports a Link to a document outside the repo, even one that exists", async () => {
		const atlas = await sampleAtlas({
			"notes.md": "# Notes\n",
			"shop/diagrams.config.ts": sampleConfig,
			"shop/shop.diagram.ts": diagramModule("Shop", [
				{ id: "shop-api", kind: "service", title: "Shop API", links: [{ doc: "../notes.md" }] },
			]),
		});
		const shop = join(atlas, "shop");
		expect((await runCli(["render"], shop)).code).toBe(0);

		expect(await runCli(["lint"], shop)).toEqual({
			code: 1,
			stdout:
				"shop.diagram.ts:4:4: error: Node `shop-api` has a Link to `../notes.md`, which isn't a file in the repo. (broken-link)\n" +
				"Checked 1 Diagram: 1 error.\n",
			stderr: "",
		});
	});
});

describe("ids across the Atlas", () => {
	test("lint reports an id with two Kinds at each place, naming the other Diagrams", async () => {
		const atlas = await sampleAtlas({
			"docs/billing.diagram.ts": diagramModule("Billing", [{ ...paymentsApi, kind: "worker" }]),
			"docs/refunds.diagram.ts": diagramModule("Refunds", [
				{ id: "refunds-api", kind: "service", title: "Refunds API" },
				paymentsApi,
			]),
			"docs/shop.diagram.ts": diagramModule("Shop", [paymentsApi]),
		});
		expect((await runCli(["render"], atlas)).code).toBe(0);

		const rule =
			"An id names one thing across the Atlas, so give it one Kind, or give one of them another id. (kind-conflict)";
		expect(await runCli(["lint"], atlas)).toEqual({
			code: 1,
			stdout:
				`docs/billing.diagram.ts:4:4: error: Node \`payments-api\` has the Kind \`worker\` here, but \`service\` on the Diagrams \`docs/refunds\` and \`docs/shop\`. ${rule}\n` +
				`docs/refunds.diagram.ts:5:4: error: Node \`payments-api\` has the Kind \`service\` here, but \`worker\` on the Diagram \`docs/billing\`. ${rule}\n` +
				`docs/shop.diagram.ts:4:4: error: Node \`payments-api\` has the Kind \`service\` here, but \`worker\` on the Diagram \`docs/billing\`. ${rule}\n` +
				"Checked 3 Diagrams: 3 errors.\n",
			stderr: "",
		});
	});

	test("lint reports an id with two titles at each place, naming the other Diagram", async () => {
		const atlas = await sampleAtlas({
			"docs/billing.diagram.ts": diagramModule("Billing", [{ ...paymentsApi, title: "Payments" }]),
			"docs/shop.diagram.ts": diagramModule("Shop", [paymentsApi]),
		});
		expect((await runCli(["render"], atlas)).code).toBe(0);

		const rule =
			"An id names one thing across the Atlas, so give it one title: define the Node once, in a shared module. (title-conflict)";
		expect(await runCli(["lint"], atlas)).toEqual({
			code: 1,
			stdout:
				`docs/billing.diagram.ts:4:4: error: Node \`payments-api\` has the title \`Payments\` here, but \`Payments API\` on the Diagram \`docs/shop\`. ${rule}\n` +
				`docs/shop.diagram.ts:4:4: error: Node \`payments-api\` has the title \`Payments API\` here, but \`Payments\` on the Diagram \`docs/billing\`. ${rule}\n` +
				"Checked 2 Diagrams: 2 errors.\n",
			stderr: "",
		});
	});
});

describe("a clean Atlas", () => {
	test("passes when ids agree across Diagrams and every Link resolves, in text and in JSON", async () => {
		const atlas = await sampleAtlas({
			"docs/payments.md": "# Payments\n\n## Refunds\n",
			"docs/billing.diagram.ts": diagramModule("Billing", [
				{
					...paymentsApi,
					links: [
						{ doc: "docs/payments.md" },
						{ doc: "docs/payments.md", section: "Refunds", label: "How refunds work" },
					],
				},
			]),
			"docs/shop.diagram.ts": diagramModule("Shop", [
				{
					id: "shop-api",
					kind: "service",
					title: "Shop API",
					links: [{ id: "payments-api", label: "Payments" }],
				},
				paymentsApi,
			]),
		});
		expect(await runCli(["render"], atlas)).toMatchObject({ code: 0, stderr: "" });

		expect(await runCli(["lint"], atlas)).toEqual({
			code: 0,
			stdout: "Checked 2 Diagrams: no errors.\n",
			stderr: "",
		});
		const json = await runCli(["lint", "--json"], atlas);
		expect(json.code).toBe(0);
		expect(JSON.parse(json.stdout)).toEqual({ diagrams: 2, errors: 0, warnings: 0, messages: [] });
	});
});

describe("shared definitions", () => {
	/** A shared module that defines the Payments API once, as a plain object. */
	const sharedNodes = (
		title: string,
	) => `import type { ArchitectureNode } from "@the-platform/diagrams";

export const paymentsApi = {
	id: "payments-api",
	kind: "service",
	title: ${JSON.stringify(title)},
	links: [{ doc: "docs/payments.md", section: "Refunds" }],
} satisfies ArchitectureNode;
`;
	/** A Diagram in which a service of its own calls the shared Payments API. */
	const caller = (name: string) => `import { architecture } from "@the-platform/diagrams";
import { paymentsApi } from "./shared/nodes.ts";

export default architecture({ title: "${name}" }, (d) => {
	const api = d.node({ id: "${name.toLowerCase()}-api", kind: "service", title: "${name} API" });
	d.edge(api, d.node(paymentsApi), { kind: "call" });
});
`;

	test("renaming a shared Node in its one place renames it on every Diagram, and lint still passes", async () => {
		const atlas = await sampleAtlas({
			"docs/payments.md": "# Payments\n\n## Refunds\n",
			"docs/shared/nodes.ts": sharedNodes("Payments API"),
			"docs/billing.diagram.ts": caller("Billing"),
			"docs/shop.diagram.ts": caller("Shop"),
		});
		expect((await runCli(["render"], atlas)).code).toBe(0);
		expect((await runCli(["lint"], atlas)).stdout).toBe("Checked 2 Diagrams: no errors.\n");

		await writeFile(join(atlas, "docs/shared/nodes.ts"), sharedNodes("Payments service"));

		expect((await runCli(["lint"], atlas)).stdout).toBe(
			"docs/billing.diagram.svg: error: The SVG no longer matches its source. Run `diagrams render`. (svg-out-of-date)\n" +
				"docs/shop.diagram.svg: error: The SVG no longer matches its source. Run `diagrams render`. (svg-out-of-date)\n" +
				"Checked 2 Diagrams: 2 errors.\n",
		);
		expect(await runCli(["render"], atlas)).toEqual({
			code: 0,
			stdout: "Wrote docs/billing.diagram.svg\nWrote docs/shop.diagram.svg\n",
			stderr: "",
		});
		for (const svg of ["docs/billing.diagram.svg", "docs/shop.diagram.svg"]) {
			const drawn = await readFile(join(atlas, svg), "utf8");
			expect(drawn).toContain(">Payments service</text>");
			expect(drawn).not.toContain("Payments API");
		}
		expect(await runCli(["lint"], atlas)).toEqual({
			code: 0,
			stdout: "Checked 2 Diagrams: no errors.\n",
			stderr: "",
		});
	});
});

describe("lint's output", () => {
	test("lists messages file by file, each file top to bottom", async () => {
		const atlas = await sampleAtlas({
			"docs/a-stock.diagram.svg": "<svg/>\n",
			"docs/billing.diagram.ts": diagramModule("Billing", [
				{ ...paymentsApi, links: [{ id: "refunds-api" }] },
				{ id: "invoices", kind: "databse", title: "Invoices" },
			]),
		});

		expect((await runCli(["lint"], atlas)).stdout).toBe(
			"docs/a-stock.diagram.svg: error: The SVG's source, `a-stock.diagram.ts`, isn't in the Atlas. Delete the SVG, or restore its source. (svg-orphaned)\n" +
				"docs/billing.diagram.ts:5:4: error: Node `invoices` has the Kind `databse`, which the architecture Notation doesn't have. Its Node Kinds are person, system, client, gateway, service, worker, function, database, cache, queue, storage and search. (unknown-kind)\n" +
				"Checked 1 Diagram: 2 errors.\n",
		);
		await writeFile(
			join(atlas, "docs/billing.diagram.ts"),
			diagramModule("Billing", [
				{ ...paymentsApi, links: [{ id: "refunds-api" }] },
				{ id: "invoices", kind: "database", title: "Invoices" },
			]),
		);
		expect((await runCli(["render"], atlas)).code).toBe(0);
		await writeFile(join(atlas, "docs/billing.diagram.svg"), "<svg/>\n");

		expect((await runCli(["lint"], atlas)).stdout).toBe(
			"docs/a-stock.diagram.svg: error: The SVG's source, `a-stock.diagram.ts`, isn't in the Atlas. Delete the SVG, or restore its source. (svg-orphaned)\n" +
				"docs/billing.diagram.svg: error: The SVG no longer matches its source. Run `diagrams render`. (svg-out-of-date)\n" +
				"docs/billing.diagram.ts:4:4: error: Node `payments-api` has a Link to `refunds-api`, which no Diagram in the Atlas draws. (broken-link)\n" +
				"Checked 1 Diagram: 3 errors.\n",
		);
	});
});
