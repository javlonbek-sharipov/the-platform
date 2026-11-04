import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	architectureEdgeKinds,
	architectureGroupKinds,
	architectureNodeKinds,
	architectureStatuses,
	technologies,
} from "../src/index.ts";
import { type CliRun, runCli, sampleAtlas } from "./support/atlas.ts";
import { pngSize } from "./support/png.ts";

const skillFile = new URL("../skills/diagrams/SKILL.md", import.meta.url);

/** The complete example Diagram that the skill shows: the code block under its `## Example` heading. */
function exampleIn(skill: string): string {
	const example = /^## Example\n[\s\S]*?^```ts\n([\s\S]*?)^```$/m.exec(skill)?.[1];
	if (example === undefined) {
		throw new Error("The skill has no `## Example` heading with a ```ts block under it.");
	}
	return example;
}

/**
 * The `diagrams` commands that the skill tells agents to run, in its order,
 * each as the CLI's arguments, with `<module>` standing for the module's path.
 */
function commandsIn(skill: string, module: string): string[][] {
	return [...skill.matchAll(/`pnpm exec diagrams ([^`]+)`/g)].map(([, command = ""]) =>
		command.split(" ").map((arg) => (arg === "<module>" ? module : arg)),
	);
}

describe("the agent skill", () => {
	test("its own commands render its example, lint it without a message, and export it as a PNG", async () => {
		const skill = await readFile(skillFile, "utf8");
		const module = "docs/example-system.diagram.ts";
		const atlas = await sampleAtlas({ [module]: exampleIn(skill) });

		const runs: Record<string, CliRun> = {};
		for (const args of commandsIn(skill, module)) {
			runs[args.join(" ")] = await runCli(args, atlas);
		}
		const png = join(atlas, ".diagrams-cache/export/docs/example-system.light.png");
		expect(runs).toEqual({
			[`render ${module}`]: {
				code: 0,
				stdout: "Wrote docs/example-system.diagram.svg\n",
				stderr: "",
			},
			"lint --json": { code: 0, stdout: expect.any(String), stderr: "" },
			[`export ${module} --format png`]: { code: 0, stdout: `${png}\n`, stderr: "" },
		});
		expect(JSON.parse(runs["lint --json"]?.stdout ?? "")).toEqual({
			diagrams: 1,
			errors: 0,
			warnings: 0,
			messages: [],
		});
		expect(pngSize(await readFile(png)).width).toBeGreaterThan(0);
	});

	test("its example is the package's example, so the repo renders, lints and type-checks the Diagram it teaches", async () => {
		const skill = await readFile(skillFile, "utf8");
		const example = await readFile(new URL("../docs/example-system.diagram.ts", import.meta.url));

		// Each ticket that adds to the engine extends the example. Copy it into the skill then.
		expect(exampleIn(skill), "the skill's copy of docs/example-system.diagram.ts").toBe(
			example.toString(),
		);
	});

	test("it names every Kind and status of the architecture Notation, and every Technology that has a logo", async () => {
		const skill = await readFile(skillFile, "utf8");
		const words = [
			...architectureNodeKinds,
			...architectureGroupKinds,
			...architectureEdgeKinds,
			...architectureStatuses,
			...Object.keys(technologies),
		];

		expect(words.filter((word) => !skill.includes(`\`${word}\``))).toEqual([]);
	});
});
