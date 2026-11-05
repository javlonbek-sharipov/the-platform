import { describe, expect, test } from "vitest";
import { domain, render } from "../src/index.ts";
import { draw, edgeGroupOf, linesOf, looksOf, strokeOf } from "./support/drawn.ts";
import { schemaErrors } from "./support/schema.ts";

const oneContext = domain({ title: "Billing" }, (d) => {
	d.group({ id: "billing", kind: "context", title: "Billing" }, (billing) => {
		billing.node({ id: "invoice", kind: "aggregate", title: "Invoice" });
	});
});

describe("an aggregate diagram", () => {
	test("ships the Kinds and Rows in the schema and draws each Node and Edge Kind distinctly", () => {
		const diagram = domain({ title: "Billing" }, (d) => {
			d.group({ id: "billing", kind: "context", title: "Billing" }, (billing) => {
				const invoice = billing.node({
					id: "invoice",
					kind: "aggregate",
					title: "Invoice",
					rows: [{ name: "Money", value: "value object" }],
				});
				const order = billing.node({ id: "order", kind: "aggregate", title: "Order" });
				const invoiced = billing.node({ id: "invoiced", kind: "event", title: "Invoiced" });
				billing.edge(invoice, order, { kind: "references" });
				billing.edge(invoice, invoiced, { kind: "emits" });
				billing.edge(invoiced, order, { kind: "reacts" });
			});
		});
		expect(schemaErrors(diagram)).toEqual([]);
		const drawn = draw(diagram);
		const aggregate = looksOf(drawn, "billing/invoice");
		const event = looksOf(drawn, "billing/invoiced");
		expect(aggregate.outline).not.toBe(event.outline);
		expect(aggregate.badge).not.toBe(event.badge);
		expect(
			drawn.scene.edges.map((edge) => ({
				kind: edge.kind,
				lines: [
					...new Set(linesOf(drawn, edge).map((line) => strokeOf(drawn, line, "light").dashes)),
				],
				// Every aggregate Edge is directed, so it draws an arrowhead.
				arrow: edgeGroupOf(drawn, edge.id).children.some(
					(shape) => shape.name === "path" && shape.attributes.get("fill") === "currentColor",
				),
			})),
		).toEqual([
			{ kind: "references", lines: ["6 4"], arrow: true },
			{ kind: "emits", lines: ["none"], arrow: true },
			{ kind: "reacts", lines: ["1 4"], arrow: true },
		]);
	});
	test("draws one aggregate as a Node with Rows and expands its local id in the JSON model", () => {
		const billing = domain({ title: "Billing" }, (d) => {
			d.group({ id: "billing", kind: "context", title: "Billing" }, (billing) => {
				billing.node({
					id: "order",
					kind: "aggregate",
					title: "Order",
					rows: [
						{ name: "OrderLine", value: "entity" },
						{ name: "Money", value: "value object" },
						{ name: "Total >= 0", value: "invariant" },
					],
				});
			});
		});
		const { diagnostics, scene, svg } = render(billing);

		expect(diagnostics).toEqual([]);
		expect(billing.members).toEqual(["billing"]);
		expect(billing.groups).toEqual([
			{ id: "billing", kind: "context", title: "Billing", members: ["billing/order"] },
		]);
		expect(billing.nodes[0]?.id).toBe("billing/order");
		expect(scene?.nodes.map(({ id, kind, rows }) => ({ id, kind, rows: rows.length }))).toEqual([
			{ id: "billing/order", kind: "aggregate", rows: 3 },
		]);
		expect(svg).toContain('<g data-node="billing/order" data-kind="aggregate">');
		expect(svg).toContain("OrderLine");
	});

	test("resolves local and full Edge endpoints, including forward declarations and Row handles", () => {
		const billing = domain({ title: "Billing" }, (d) => {
			d.node({ id: "ordering/order-placed", kind: "event", title: "Order placed" });
			d.group({ id: "billing", kind: "context", title: "Billing" }, (billing) => {
				billing.edge("invoice", "invoiced", { kind: "emits" });
				const order = billing.node({ id: "order", kind: "aggregate", title: "Order" });
				const invoice = billing.node({
					id: "invoice",
					kind: "aggregate",
					title: "Invoice",
					rows: [{ name: "OrderId", value: "value object" }],
				});
				billing.node({ id: "invoiced", kind: "event", title: "Invoiced" });
				billing.edge(invoice.row("OrderId"), order, { kind: "references" });
				billing.edge(
					"ordering/order-placed",
					{ node: "invoice", row: "OrderId" },
					{ kind: "reacts" },
				);
			});
		});
		const { diagnostics, svg } = render(billing);

		expect(diagnostics).toEqual([]);
		expect(billing.edges).toEqual([
			{
				id: "billing/invoice->billing/invoiced",
				kind: "emits",
				from: "billing/invoice",
				to: "billing/invoiced",
			},
			{
				id: "billing/invoice->billing/order",
				kind: "references",
				from: { node: "billing/invoice", row: "OrderId" },
				to: "billing/order",
			},
			{
				id: "ordering/order-placed->billing/invoice",
				kind: "reacts",
				from: "ordering/order-placed",
				to: { node: "billing/invoice", row: "OrderId" },
			},
		]);
		expect(svg).toContain("Invoice emits Invoiced.");
		expect(svg).toContain("Invoice (OrderId) references Order.");
		expect(svg).toContain("Order placed triggers Invoice (OrderId).");
	});

	test("rejects a full id from another context among a context Group's members", () => {
		const misplaced = domain({ title: "Billing" }, (d) => {
			d.group({ id: "billing", kind: "context", title: "Billing" }, (billing) => {
				billing.node({ id: "ordering/order", kind: "aggregate", title: "Order" });
			});
		});

		expect(render(misplaced)).toEqual({
			diagnostics: [
				{
					severity: "error",
					rule: "namespace",
					pointer: "/groups/0/members/0",
					message:
						"Group `billing` has the member `ordering/order`, whose full id doesn't belong to its namespace. Write a local id in the builder, or a full id like `billing/order` in JSON.",
				},
			],
		});
	});
});

describe("the two domain forms", () => {
	test.each([
		["references", "event", "order", "from"],
		["references", "order", "event", "to"],
		["emits", "event", "event", "from"],
		["emits", "order", "other", "to"],
		["reacts", "order", "other", "from"],
		["reacts", "event", "event", "to"],
	] as const)("%s rejects %s -> %s at its %s end", (kind, from, to, end) => {
		const model = domain({ title: "Ordering" }, (d) => {
			d.group({ id: "ordering", kind: "context", title: "Ordering" }, (ordering) => {
				ordering.node({ id: "order", kind: "aggregate", title: "Order" });
				ordering.node({ id: "other", kind: "aggregate", title: "Other" });
				ordering.node({ id: "event", kind: "event", title: "Placed" });
				ordering.edge(from, to, { kind });
			});
		});
		expect(render(model).diagnostics).toEqual([
			expect.objectContaining({
				severity: "error",
				rule: "edge-end-kind",
				pointer: `/edges/0/${end}`,
			}),
		]);
	});

	test("generated JSON must already contain full ids; validation never guesses a namespace", () => {
		const local = {
			...oneContext,
			nodes: [{ id: "invoice", kind: "aggregate", title: "Invoice" }],
			groups: [{ ...oneContext.groups[0], members: ["invoice"] }],
		};
		expect(render(local).diagnostics).toEqual([
			expect.objectContaining({
				severity: "error",
				rule: "namespace",
				pointer: "/groups/0/members/0",
			}),
		]);
	});

	test("an aggregate emits its own context's events, while another context's event may react into it", () => {
		const foreign = domain({ title: "Billing" }, (d) => {
			const placed = d.node({ id: "ordering/order-placed", kind: "event", title: "Order placed" });
			d.group({ id: "billing", kind: "context", title: "Billing" }, (billing) => {
				const invoice = billing.node({ id: "invoice", kind: "aggregate", title: "Invoice" });
				billing.edge(invoice, placed, { kind: "emits" });
			});
		});
		expect(render(foreign).diagnostics).toEqual([
			expect.objectContaining({
				severity: "error",
				rule: "domain-form",
				pointer: "/edges/0/to",
				message:
					"Edge `billing/invoice->ordering/order-placed` emits another context's event, `ordering/order-placed`. An aggregate emits events inside its own context Group; another context's event may react into this context instead.",
			}),
		]);
	});

	test("a context's own id has no namespace, on either form", () => {
		const map = domain({ title: "Billing" }, (d) => {
			d.node({ id: "shop/billing", kind: "context", title: "Billing" });
		});
		const aggregate = domain({ title: "Billing" }, (d) => {
			d.group({ id: "shop/billing", kind: "context", title: "Billing" }, () => {});
		});
		for (const [model, pointer] of [
			[map, "/nodes/0/id"],
			[aggregate, "/groups/0/id"],
		] as const) {
			expect(render(model).diagnostics).toEqual([
				{
					severity: "error",
					rule: "namespace",
					pointer,
					message:
						"Context `shop/billing` has a namespaced id. A context's id is one lowercase kebab-case name, such as `billing`; only its members have full ids like `billing/invoice`.",
				},
			]);
		}
	});

	test.each([
		[
			"a context map mixed with an aggregate diagram",
			{
				...oneContext,
				members: ["ordering", ...oneContext.members],
				nodes: [{ id: "ordering", kind: "context", title: "Ordering" }, ...oneContext.nodes],
			},
			"/nodes/0/kind",
		],
		[
			"aggregates without their context Group",
			{
				...oneContext,
				members: ["billing/invoice"],
				groups: [],
			},
			"/groups",
		],
		[
			"two context Groups",
			{
				...oneContext,
				members: ["billing", "ordering"],
				groups: [
					...oneContext.groups,
					{ id: "ordering", kind: "context", title: "Ordering", members: [] },
				],
			},
			"/groups",
		],
		[
			"an aggregate outside its context Group",
			{
				...oneContext,
				members: ["billing", "billing/invoice"],
				groups: [{ ...oneContext.groups[0], members: [] }],
			},
			"/nodes/0",
		],
		[
			"an event outside its own context Group",
			{
				...oneContext,
				members: [...oneContext.members, "billing/invoiced"],
				nodes: [...oneContext.nodes, { id: "billing/invoiced", kind: "event", title: "Invoiced" }],
			},
			"/nodes/1",
		],
		[
			"an event outside with only a local id",
			{
				...oneContext,
				members: [...oneContext.members, "invoiced"],
				nodes: [...oneContext.nodes, { id: "invoiced", kind: "event", title: "Invoiced" }],
			},
			"/nodes/1",
		],
	] as const)("rejects %s", (_what, model, pointer) => {
		const result = render(model);
		expect(result.scene).toBeUndefined();
		expect(result.diagnostics).toEqual([
			expect.objectContaining({ severity: "error", rule: "domain-form", pointer }),
		]);
	});
});
