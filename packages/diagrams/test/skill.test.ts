import { readFile, realpath } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
	edgeKindsOf,
	groupKindsOf,
	nodeKindsOf,
	notations,
	rolesOf,
	statusesOf,
	technologies,
} from "../src/index.ts";
import { type CliRun, runCli, sampleAtlas, sampleConfig } from "./support/atlas.ts";
import { pngSize } from "./support/png.ts";

const skillFile = new URL("../skills/diagrams/SKILL.md", import.meta.url);
const repo = new URL("../../../", import.meta.url);

/**
 * The complete example Diagrams that the skill shows, one for each form of
 * Diagram: the heading that each sits under in the skill, and the package's
 * module that it copies.
 */
const examples: { heading: string; module: string; support: string[]; glossary?: string }[] = [
	{ heading: "Example", module: "docs/example-system.diagram.ts", support: [] },
	{
		heading: "Context maps",
		module: "docs/example-context-map.diagram.ts",
		support: ["docs/shared/ordering.ts"],
	},
	{
		heading: "Aggregate diagrams",
		module: "docs/example-billing.diagram.ts",
		support: ["docs/shared/ordering.ts", "docs/example-ordering.diagram.ts"],
	},
	{
		heading: "Term Links",
		module: "docs/example-glossary-links.diagram.ts",
		support: ["GLOSSARY.md"],
		glossary: "GLOSSARY.md",
	},
];

/** A complete example Diagram that the skill shows: the first code block under a heading of its own. */
function exampleUnder(skill: string, heading: string): string {
	const section = skill.split(/^## /m).find((part) => part.startsWith(`${heading}\n`));
	const example = /^```ts\n([\s\S]*?)^```$/m.exec(section ?? "")?.[1];
	if (example === undefined) {
		throw new Error(`The skill has no \`## ${heading}\` heading with a \`\`\`ts block under it.`);
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
	test.each(examples)(
		"its own commands render its example under `$heading`, lint it without a message, and export it as a PNG",
		async ({ heading, module, support, glossary }) => {
			const skill = await readFile(skillFile, "utf8");
			const files = Object.fromEntries(
				await Promise.all(
					support.map(async (file) => [
						file,
						await readFile(new URL(`../${file}`, import.meta.url), "utf8"),
					]),
				),
			);
			const config =
				glossary === undefined
					? sampleConfig
					: sampleConfig.replace(
							"atlas({})",
							`atlas({ contexts: { diagrams: { glossary: ${JSON.stringify(glossary)} } } })`,
						);
			const atlas = await sampleAtlas({
				...files,
				"diagrams.config.ts": config,
				[module]: exampleUnder(skill, heading),
			});
			// The example borrows an event from an existing Diagram. Render that
			// fixture under the sample Atlas's paths before following the skill.
			const companions = support.filter((file) => file.endsWith(".diagram.ts"));
			if (companions.length > 0) {
				expect((await runCli(["render", ...companions], atlas)).code).toBe(0);
			}
			const name = module.slice(0, -".diagram.ts".length);

			const runs: Record<string, CliRun> = {};
			for (const args of commandsIn(skill, module)) {
				runs[args.join(" ")] = await runCli(args, atlas);
			}
			const png = join(atlas, `.diagrams-cache/export/${name}.light.png`);
			expect(runs).toEqual({
				[`render ${module}`]: { code: 0, stdout: `Wrote ${name}.diagram.svg\n`, stderr: "" },
				"lint --json": { code: 0, stdout: expect.any(String), stderr: "" },
				[`export ${module} --format png`]: { code: 0, stdout: `${png}\n`, stderr: "" },
			});
			expect(JSON.parse(runs["lint --json"]?.stdout ?? "")).toEqual({
				diagrams: 1 + support.filter((file) => file.endsWith(".diagram.ts")).length,
				errors: 0,
				warnings: 0,
				messages: [],
			});
			expect(pngSize(await readFile(png)).width).toBeGreaterThan(0);
		},
	);

	test.each(examples)(
		"its example under `$heading` is the package's, so the repo renders, lints and type-checks the Diagram it teaches",
		async ({ heading, module }) => {
			const skill = await readFile(skillFile, "utf8");
			const example = await readFile(new URL(`../${module}`, import.meta.url));

			// Each ticket that adds to the engine extends an example. Copy it into the skill then.
			expect(exampleUnder(skill, heading), `the skill's copy of ${module}`).toBe(
				example.toString(),
			);
		},
	);

	test("it names every Kind, status and role of each Notation, and every Technology that has a logo", async () => {
		const skill = await readFile(skillFile, "utf8");
		const words = [
			...notations.flatMap((notation) => [
				notation.name,
				...nodeKindsOf(notation),
				...groupKindsOf(notation),
				...edgeKindsOf(notation),
				...statusesOf(notation),
				...rolesOf(notation),
			]),
			...Object.keys(technologies),
		];

		expect(words).toEqual(
			expect.arrayContaining(["context", "partnership", "customer-supplier", "OHS", "ACL"]),
		);
		expect(words.filter((word) => !skill.includes(`\`${word}\``))).toEqual([]);
	});

	test("agents reach it where Claude Code and Codex look for skills, under its own name, and from AGENTS.md", async () => {
		const skill = await realpath(fileURLToPath(skillFile));
		const name = /^---\nname: ([^\n]*)\ndescription: [^\n]+\n---\n/.exec(
			await readFile(skill, "utf8"),
		)?.[1];

		for (const folder of [".claude/skills/diagrams", ".agents/skills/diagrams"]) {
			const exposed = fileURLToPath(new URL(`${folder}/SKILL.md`, repo));
			expect(await realpath(exposed), folder).toBe(skill);
			expect(name, folder).toBe(basename(folder));
		}
		expect(await readFile(new URL("AGENTS.md", repo), "utf8")).toContain(
			"packages/diagrams/skills/diagrams/SKILL.md",
		);
	});
});
