import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { git, runCli, sampleAtlas, shopModule } from "./support/atlas.ts";

const billingConfig = `import { atlas } from "@the-platform/diagrams";

export default atlas({ contexts: { billing: { glossary: "billing/GLOSSARY.md" } } });
`;

test("the index reads every bold-term glossary entry, preserving its definition and source metadata", async () => {
	const root = await sampleAtlas({
		"diagrams.config.ts": billingConfig,
		"billing/GLOSSARY.md": `# Billing

## Language

**Invoice**:
A demand for **payment**.
It has [lines](./lines.md).
_Avoid_: bill, payment request

**Money**:
An amount and a currency.

### Examples

\`\`\`md
**Fake**:
Not a term.
\`\`\`
`,
	});
	const result = await runCli(["export", "--index"], root);
	expect(result).toEqual({
		code: 0,
		stdout: `${join(root, ".diagrams-cache/index.json")}\n`,
		stderr: "",
	});
	expect(JSON.parse(await readFile(result.stdout.trim(), "utf8"))).toEqual({
		diagrams: [],
		ids: {},
		terms: [
			{
				context: "billing",
				term: "Invoice",
				definition: "A demand for **payment**.\nIt has [lines](./lines.md).",
				avoid: ["bill", "payment request"],
				anchor: "invoice",
				glossary: "billing/GLOSSARY.md",
				line: 5,
			},
			{
				context: "billing",
				term: "Money",
				definition: "An amount and a currency.",
				avoid: [],
				anchor: "money",
				glossary: "billing/GLOSSARY.md",
				line: 10,
			},
		],
	});
});

test("term anchors avoid glossary headings so the docs site can address the actual term entry", async () => {
	const root = await sampleAtlas({
		"diagrams.config.ts": billingConfig,
		"billing/GLOSSARY.md":
			"# Invoice\n\n## Invoice-1\n\n**Invoice**:\nA demand for payment.\n\n**Invoice line**:\nOne charge.\n",
	});
	const result = await runCli(["export", "--index"], root);
	expect(result.code).toBe(0);
	const index = JSON.parse(await readFile(result.stdout.trim(), "utf8"));
	expect(
		index.terms.map(({ term, anchor }: { term: string; anchor: string }) => ({ term, anchor })),
	).toEqual([
		{ term: "Invoice", anchor: "invoice-2" },
		{ term: "Invoice line", anchor: "invoice-line" },
	]);
});

test.each([
	["[]", "/contexts"],
	['{ "Billing": { glossary: "billing/GLOSSARY.md" } }', "/contexts/Billing"],
	['{ billing: "billing/GLOSSARY.md" }', "/contexts/billing"],
	["{ billing: {} }", "/contexts/billing/glossary"],
	["{ billing: { glossary: 7 } }", "/contexts/billing/glossary"],
	['{ billing: { glossary: "billing/GLOSSARY.md", glosary: "x" } }', "/contexts/billing/glosary"],
	['{ billing: { glossary: "../GLOSSARY.md" } }', "/contexts/billing/glossary"],
	['{ billing: { glossary: "/tmp/GLOSSARY.md" } }', "/contexts/billing/glossary"],
	['{ billing: { glossary: "billing" } }', "/contexts/billing/glossary"],
	['{ billing: { glossary: "billing/missing.md" } }', "/contexts/billing/glossary"],
])(
	"lint locates a malformed or missing context glossary at the config: %s",
	async (contexts, pointer) => {
		const root = await sampleAtlas({
			"diagrams.config.ts": billingConfig.replace(
				'{ billing: { glossary: "billing/GLOSSARY.md" } }',
				contexts,
			),
			"billing/GLOSSARY.md": "**Invoice**:\nA demand for payment.\n",
		});
		const lint = await runCli(["lint", "--json"], root);
		expect(lint).toMatchObject({ code: 1, stderr: "" });
		expect(JSON.parse(lint.stdout)).toMatchObject({
			diagrams: 0,
			errors: 1,
			warnings: 0,
			messages: [
				{
					file: "diagrams.config.ts",
					line: 3,
					column: 16,
					severity: "error",
					rule: expect.stringMatching(/^config-|^glossary-/),
					pointer,
					message: expect.any(String),
				},
			],
		});
		const index = await runCli(["export", "--index"], root);
		expect(index.code).toBe(1);
		expect(index.stdout).toBe("");
	},
);

test("term Links use a context Node's own glossary, full-id ownership and explicit context overrides", async () => {
	const root = await sampleAtlas({
		"diagrams.config.ts": billingConfig.replace(
			'billing: { glossary: "billing/GLOSSARY.md" }',
			'billing: { glossary: "billing/GLOSSARY.md" }, ordering: { glossary: "ordering/GLOSSARY.md" }',
		),
		"billing/GLOSSARY.md": "**Invoice**:\nA demand for payment.\n",
		"ordering/GLOSSARY.md":
			"**Order**:\nA purchase.\n\n**Order placed**:\nAn order was accepted.\n",
		"docs/map.diagram.ts": `import { domain } from "@the-platform/diagrams";
export default domain({ title: "Map" }, (d) => {
	d.node({ id: "billing", kind: "context", title: "Billing", links: [{ term: " invoice " }] });
	d.node({ id: "ordering", kind: "context", title: "Ordering", links: [{ term: "Order" }] });
	d.node({ id: "external", kind: "context", title: "External" });
});`,
		"docs/billing.diagram.ts": `import { domain } from "@the-platform/diagrams";
export default domain({ title: "Billing" }, (d) => {
	d.node({ id: "ordering/order-placed", kind: "event", title: "Order placed", links: [{ term: "Order placed" }] });
	d.group({ id: "billing", kind: "context", title: "Billing", links: [{ term: "Invoice" }] }, (billing) => {
		billing.node({ id: "invoice", kind: "aggregate", title: "Invoice", links: [{ term: "Invoice" }, { term: "Order", context: "ordering" }] });
	});
});`,
		"docs/ordering.diagram.ts": `import { domain } from "@the-platform/diagrams";
export default domain({ title: "Ordering" }, (d) => {
	d.group({ id: "ordering", kind: "context", title: "Ordering" }, (ordering) => {
		ordering.node({ id: "order-placed", kind: "event", title: "Order placed" });
	});
});`,
	});
	expect((await runCli(["render"], root)).code).toBe(0);
	const lint = await runCli(["lint", "--json"], root);
	expect(lint).toMatchObject({ code: 0, stderr: "" });
	expect(JSON.parse(lint.stdout)).toEqual({ diagrams: 3, errors: 0, warnings: 0, messages: [] });
	const index = await runCli(["export", "--index"], root);
	expect(index.code).toBe(0);
	const ids = JSON.parse(await readFile(index.stdout.trim(), "utf8")).ids;
	expect(ids.billing).toMatchObject({
		context: "billing",
		asNode: ["docs/map"],
		asGroup: ["docs/billing"],
	});
	expect(ids["billing/invoice"]).toMatchObject({ context: "billing" });
	expect(ids["ordering/order-placed"]).toMatchObject({ context: "ordering" });
});

test("lint reports unknown terms, missing glossary contexts and owners without a context as useful JSON", async () => {
	const root = await sampleAtlas({
		"diagrams.config.ts": billingConfig,
		"billing/GLOSSARY.md": "**Invoice**:\nA demand for payment.\n",
		"docs/billing.diagram.ts": `import { domain } from "@the-platform/diagrams";
export default domain({ title: "Billing" }, (d) => {
	d.node({ id: "billing", kind: "context", title: "Billing", links: [{ term: "Invioce" }, { term: "Invoice", context: "missing" }] });
	d.node({ id: "ordering", kind: "context", title: "Ordering", links: [{ term: "Order" }] });
});`,
		"docs/service.diagram.ts": `import { architecture } from "@the-platform/diagrams";
export default architecture({ title: "Billing API" }, (d) => {
	d.node({ id: "billing-api", kind: "service", title: "Billing API", links: [{ term: "Invoice" }] });
});`,
	});
	expect((await runCli(["render"], root)).code).toBe(0);
	const lint = await runCli(["lint", "--json"], root);
	expect(lint).toMatchObject({ code: 1, stderr: "" });
	const messages = JSON.parse(lint.stdout).messages;
	expect(messages).toHaveLength(4);
	expect(messages).toEqual([
		expect.objectContaining({
			file: "docs/billing.diagram.ts",
			line: 3,
			column: 4,
			rule: "broken-link",
			pointer: "/nodes/0/links/0",
			message: expect.stringContaining("Invioce"),
		}),
		expect.objectContaining({
			file: "docs/billing.diagram.ts",
			line: 3,
			column: 4,
			rule: "broken-link",
			pointer: "/nodes/0/links/1",
			message: expect.stringContaining("missing"),
		}),
		expect.objectContaining({
			file: "docs/billing.diagram.ts",
			line: 4,
			column: 4,
			rule: "broken-link",
			pointer: "/nodes/1/links/0",
			message: expect.stringContaining("no glossary"),
		}),
		expect.objectContaining({
			file: "docs/service.diagram.ts",
			line: 3,
			column: 4,
			rule: "broken-link",
			pointer: "/nodes/0/links/0",
			message: expect.stringContaining("no context"),
		}),
	]);
	const index = await runCli(["export", "--index"], root);
	expect(index).toMatchObject({ code: 1, stdout: "" });
	expect(index.stderr).toContain("broken-link");
});

test("glossary warnings check titles, both Row fields and Edge labels in their owning contexts", async () => {
	const root = await sampleAtlas({
		"diagrams.config.ts": billingConfig.replace(
			'billing: { glossary: "billing/GLOSSARY.md" }',
			'billing: { glossary: "billing/GLOSSARY.md" }, ordering: { glossary: "ordering/GLOSSARY.md" }',
		),
		"billing/GLOSSARY.md":
			"**Invoice**:\nA demand for payment.\n_Avoid_: bill, payment request\n\n**Line**:\nOne charge.\n_Avoid_: item\n",
		"ordering/GLOSSARY.md": "**Order**:\nA purchase.\n_Avoid_: purchase\n",
		"docs/billing.diagram.ts": `import { domain } from "@the-platform/diagrams";
export default domain({ title: "Bill" }, (d) => {
	d.node({ id: "ordering/placed", kind: "event", title: "Purchase" });
	d.group({ id: "billing", kind: "context", title: "Billing" }, (billing) => {
		const invoice = billing.node({ id: "invoice", kind: "aggregate", title: "Bill", rows: [{ name: "Item", value: "BILL" }] });
		billing.node({ id: "other", kind: "aggregate", title: "Purchase" });
		const issued = billing.node({ id: "issued", kind: "event", title: "Issued" });
		billing.edge(invoice, issued, { kind: "emits", label: "Payment request" });
	});
});`,
		"docs/ordering.diagram.ts": `import { domain } from "@the-platform/diagrams";
export default domain({ title: "Ordering" }, (d) => {
	d.group({ id: "ordering", kind: "context", title: "Ordering" }, (ordering) => {
		ordering.node({ id: "placed", kind: "event", title: "Purchase" });
	});
});`,
		"docs/map.diagram.ts": `import { domain } from "@the-platform/diagrams";
export default domain({ title: "Map" }, (d) => {
	const billing = d.node({ id: "billing", kind: "context", title: "Billing" });
	const ordering = d.node({ id: "ordering", kind: "context", title: "Ordering" });
	d.edge(ordering, billing, { kind: "partnership", label: "Bill purchase" });
	d.node({ id: "external", kind: "context", title: "Bill" });
});`,
	});
	expect((await runCli(["render"], root)).code).toBe(0);
	const lint = await runCli(["lint", "--json"], root);
	expect(lint.code).toBe(0);
	const report = JSON.parse(lint.stdout);
	expect(report).toMatchObject({ errors: 0, warnings: 9 });
	expect(report.messages).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				file: "docs/billing.diagram.ts",
				line: 2,
				pointer: "/title",
				rule: "glossary-avoid",
				message: expect.stringContaining("Invoice"),
			}),
			expect.objectContaining({
				file: "docs/billing.diagram.ts",
				line: 3,
				pointer: "/nodes/0/title",
				rule: "glossary-avoid",
				message: expect.stringContaining("Order"),
			}),
			expect.objectContaining({
				file: "docs/billing.diagram.ts",
				line: 5,
				pointer: "/nodes/1/rows/0/name",
				rule: "glossary-avoid",
				message: expect.stringContaining("Line"),
			}),
			expect.objectContaining({
				file: "docs/billing.diagram.ts",
				line: 5,
				pointer: "/nodes/1/rows/0/value",
				rule: "glossary-avoid",
				message: expect.stringContaining("Invoice"),
			}),
			expect.objectContaining({
				file: "docs/map.diagram.ts",
				pointer: "/edges/0/label",
				rule: "glossary-avoid",
				message: expect.stringContaining("ordering"),
			}),
			expect.objectContaining({
				file: "docs/map.diagram.ts",
				pointer: "/edges/0/label",
				rule: "glossary-avoid",
				message: expect.stringContaining("billing"),
			}),
		]),
	);
	expect(
		report.messages.every(
			(message: { rule: string; severity: string }) =>
				message.rule === "glossary-avoid" && message.severity === "warning",
		),
	).toBe(true);
	const index = await runCli(["export", "--index"], root);
	expect(index).toMatchObject({ code: 0, stderr: "" });
});

test("staged lint reads staged glossary entries and config, even when the working tree disagrees", async () => {
	const glossary = "**Invoice**:\nA demand for payment.\n_Avoid_: bill\n";
	const root = await sampleAtlas({
		".gitignore": "node_modules/\n",
		"diagrams.config.ts": billingConfig,
		"billing/GLOSSARY.md": glossary,
		"docs/billing.diagram.ts": `import { domain } from "@the-platform/diagrams";
export default domain({ title: "Billing" }, (d) => {
	d.node({ id: "billing", kind: "context", title: "Invoice", links: [{ term: "Invoice" }] });
});`,
	});
	git(root, "init", "-q");
	expect((await runCli(["render"], root)).code).toBe(0);
	git(root, "add", "-A");
	const read = async (staged: boolean) => {
		const result = await runCli(["lint", "--json", ...(staged ? ["--staged"] : [])], root);
		return { code: result.code, ...JSON.parse(result.stdout) };
	};
	await writeFile(join(root, "billing/GLOSSARY.md"), "**Bill**:\nA bill.\n_Avoid_: invoice\n");
	expect(await read(false)).toMatchObject({ code: 1, errors: 1, warnings: 1 });
	expect(await read(true)).toMatchObject({ code: 0, errors: 0, warnings: 0, messages: [] });
	git(root, "add", "billing/GLOSSARY.md");
	await writeFile(join(root, "billing/GLOSSARY.md"), glossary);
	expect(await read(false)).toMatchObject({ code: 0, errors: 0, warnings: 0 });
	const staged = await read(true);
	expect(staged).toMatchObject({ code: 1, errors: 1, warnings: 1 });
	expect(staged.messages).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ rule: "broken-link", file: "docs/billing.diagram.ts", line: 3 }),
			expect.objectContaining({ rule: "glossary-avoid", file: "docs/billing.diagram.ts", line: 3 }),
		]),
	);
	git(root, "rm", "--cached", "-f", "billing/GLOSSARY.md");
	expect(await read(true)).toMatchObject({
		code: 1,
		messages: expect.arrayContaining([
			expect.objectContaining({
				rule: "glossary-load",
				file: "diagrams.config.ts",
				line: 3,
				pointer: "/contexts/billing/glossary",
			}),
		]),
	});
	git(root, "add", "billing/GLOSSARY.md");
	await writeFile(
		join(root, "diagrams.config.ts"),
		billingConfig.replace("billing/GLOSSARY.md", "billing/missing.md"),
	);
	git(root, "add", "diagrams.config.ts");
	await writeFile(join(root, "diagrams.config.ts"), billingConfig);
	expect(await read(false)).toMatchObject({ code: 0, errors: 0 });
	expect(await read(true)).toMatchObject({
		code: 1,
		messages: expect.arrayContaining([
			expect.objectContaining({ rule: "glossary-load", file: "diagrams.config.ts", line: 3 }),
		]),
	});
});

test.each([
	["**Invoice**:\n_Avoid_: bill\n", 1, "definition"],
	["**Invoice**: A demand for payment.\n", 1, "line of its own"],
	["**Invoice**:\nA demand.\n\n**invoice**:\nAnother demand.\n", 4, "already"],
	["**Invoice**:\nA demand.\n_Avoid_: bill,\n", 3, "empty"],
	["_Avoid_: bill\n", 1, "term"],
])(
	"lint reports malformed glossary entries with both config and glossary positions: %s",
	async (glossary, line, reason) => {
		const root = await sampleAtlas({
			"diagrams.config.ts": billingConfig,
			"billing/GLOSSARY.md": glossary,
		});
		const lint = await runCli(["lint", "--json"], root);
		expect(lint.code).toBe(1);
		expect(JSON.parse(lint.stdout)).toMatchObject({
			errors: 1,
			messages: [
				{
					file: "diagrams.config.ts",
					line: 3,
					column: 16,
					rule: "glossary-entry",
					pointer: "/contexts/billing/glossary",
					message: expect.stringContaining(`billing/GLOSSARY.md:${line}:1`),
				},
			],
		});
		expect(JSON.parse(lint.stdout).messages[0].message).toContain(reason);
	},
);

test("every command opens the config and reports its load failure before writing output", async () => {
	const root = await sampleAtlas({
		"diagrams.config.ts": 'throw new Error("No config today.");\n',
		"docs/shop.diagram.ts": shopModule(),
	});
	for (const args of [
		["render"],
		["export", "docs/shop.diagram.ts", "--format", "json"],
		["export", "docs/shop.diagram.ts", "--format", "png"],
		["export", "--index"],
	]) {
		const result = await runCli(args, root);
		expect(result.code, args.join(" ")).toBe(1);
		expect(result.stdout + result.stderr).toContain(
			"diagrams.config.ts:1:7: error: The module failed to load: No config today. (module-load)",
		);
	}
	const lint = await runCli(["lint", "--json"], root);
	expect(lint.code).toBe(1);
	expect(JSON.parse(lint.stdout).messages).toContainEqual({
		file: "diagrams.config.ts",
		line: 1,
		column: 7,
		severity: "error",
		rule: "module-load",
		message: "The module failed to load: No config today.",
	});
	expect(existsSync(join(root, "docs/shop.diagram.svg"))).toBe(false);
	expect(existsSync(join(root, ".diagrams-cache"))).toBe(false);
});
