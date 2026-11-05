import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { runCli, sampleAtlas } from "./support/atlas.ts";

const billing = `import { domain } from "@the-platform/diagrams";

export default domain({ title: "Billing" }, (d) => {
	d.node({ id: "ordering/order-placed", kind: "event", title: "Order placed" });
	d.group({ id: "billing", kind: "context", title: "Billing" }, (billing) => {
		const order = billing.node({ id: "order", kind: "aggregate", title: "Order" });
		billing.edge("ordering/order-placed", order, { kind: "reacts" });
	});
});
`;

const ordering = `import { domain } from "@the-platform/diagrams";

export default domain({ title: "Ordering" }, (d) => {
	d.group({ id: "ordering", kind: "context", title: "Ordering" }, (ordering) => {
		const order = ordering.node({ id: "order", kind: "aggregate", title: "Order" });
		const placed = ordering.node({ id: "order-placed", kind: "event", title: "Order placed" });
		ordering.edge(order, placed, { kind: "emits" });
	});
});
`;

const map = `import { domain } from "@the-platform/diagrams";

export default domain({ title: "Shop" }, (d) => {
	const ordering = d.node({ id: "ordering", kind: "context", title: "Ordering" });
	const billing = d.node({ id: "billing", kind: "context", title: "Billing" });
	d.edge(ordering, billing, { kind: "upstream-downstream" });
});
`;

test("lint warns at a foreign event's declaration when no Diagram draws it inside its own context", async () => {
	const atlas = await sampleAtlas({ "docs/billing.diagram.ts": billing });
	expect((await runCli(["render"], atlas)).code).toBe(0);
	const result = await runCli(["lint", "--json"], atlas);

	expect(result.code).toBe(0);
	expect(JSON.parse(result.stdout)).toEqual({
		diagrams: 1,
		errors: 0,
		warnings: 1,
		messages: [
			{
				file: "docs/billing.diagram.ts",
				line: 4,
				column: 4,
				severity: "warning",
				rule: "namespace-home-missing",
				pointer: "/nodes/0/id",
				message:
					"Node `ordering/order-placed` is drawn from namespace `ordering`, but no Diagram in the Atlas draws it inside Group `ordering`. Draw it inside its own namespace on another Diagram so readers can find where it belongs.",
			},
		],
	});
});

test("a context Node or an empty context Group doesn't supply an event's home, but drawing the event inside does", async () => {
	const emptyHome = ordering
		.replace(/^.*ordering\.node.*\n/gm, "")
		.replace(/^.*ordering\.edge.*\n/gm, "");
	const atlas = await sampleAtlas({
		"docs/billing.diagram.ts": billing,
		"docs/map.diagram.ts": map,
		"docs/ordering.diagram.ts": emptyHome,
	});
	expect((await runCli(["render"], atlas)).code).toBe(0);
	const missing = JSON.parse((await runCli(["lint", "--json"], atlas)).stdout);
	expect(missing.messages).toEqual([expect.objectContaining({ rule: "namespace-home-missing" })]);

	await writeFile(join(atlas, "docs/ordering.diagram.ts"), ordering);
	expect((await runCli(["render"], atlas)).code).toBe(0);
	expect(JSON.parse((await runCli(["lint", "--json"], atlas)).stdout)).toEqual({
		diagrams: 3,
		errors: 0,
		warnings: 0,
		messages: [],
	});
});

test("the Atlas index records a context as both Node and Group, and keeps equal local ids in different contexts distinct", async () => {
	const atlas = await sampleAtlas({
		"docs/billing.diagram.ts": billing,
		"docs/map.diagram.ts": map,
		"docs/ordering.diagram.ts": ordering,
	});
	const exported = await runCli(["export", "--index"], atlas);
	expect(exported.code).toBe(0);
	expect(exported.stderr).toBe("");
	const index = JSON.parse(await readFile(exported.stdout.trim(), "utf8"));
	expect(index.ids).toEqual({
		billing: {
			context: "billing",
			kind: "context",
			title: "Billing",
			asNode: ["docs/map"],
			asGroup: ["docs/billing"],
		},
		"billing/order": {
			context: "billing",
			kind: "aggregate",
			title: "Order",
			asNode: ["docs/billing"],
			asGroup: [],
		},
		ordering: {
			context: "ordering",
			kind: "context",
			title: "Ordering",
			asNode: ["docs/map"],
			asGroup: ["docs/ordering"],
		},
		"ordering/order": {
			context: "ordering",
			kind: "aggregate",
			title: "Order",
			asNode: ["docs/ordering"],
			asGroup: [],
		},
		"ordering/order-placed": {
			context: "ordering",
			kind: "event",
			title: "Order placed",
			asNode: ["docs/billing", "docs/ordering"],
			asGroup: [],
		},
	});
});

test("a context's title must agree between its context-map Node and aggregate-diagram Group", async () => {
	const atlas = await sampleAtlas({
		"docs/map.diagram.ts": map,
		"docs/ordering.diagram.ts": ordering.replace(
			'title: "Ordering" }, (ordering)',
			'title: "Sales" }, (ordering)',
		),
	});
	const result = await runCli(["export", "--index"], atlas);
	expect(result.code).toBe(1);
	expect(result.stdout).toBe("");
	expect(result.stderr).toContain("(title-conflict)");
	expect(result.stderr).toContain("Group `ordering` has the title `Sales` here");
	expect(result.stderr).toContain("Node `ordering` has the title `Ordering` here");
});
