import { rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { git, runCli, sampleAtlas, shopModule } from "./support/atlas.ts";

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
});
