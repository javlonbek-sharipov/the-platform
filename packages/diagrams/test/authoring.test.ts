import { describe, expect, test } from "vitest";
import { type ArchitectureBuilder, architecture } from "../src/index.ts";

describe("the architecture builder", () => {
	test("produces a version-1 JSON model", () => {
		const diagram = architecture({ title: "Shop" }, (d) => {
			const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
			const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
			d.edge(web, api, { kind: "call" });
		});

		expect(diagram).toEqual({
			version: 1,
			notation: "architecture",
			title: "Shop",
			direction: "right",
			members: ["web-app", "shop-api"],
			nodes: [
				{ id: "web-app", kind: "client", title: "Web app" },
				{ id: "shop-api", kind: "service", title: "Shop API" },
			],
			groups: [],
			edges: [{ id: "web-app->shop-api", kind: "call", from: "web-app", to: "shop-api" }],
			walkthroughs: [],
		});
	});

	test("lays a Diagram out to the right unless its author chooses down", () => {
		const build = (d: ArchitectureBuilder) => {
			d.node({ id: "shop-api", kind: "service", title: "Shop API" });
		};

		expect(architecture({ title: "Shop" }, build).direction).toBe("right");
		expect(architecture({ title: "Shop", direction: "right" }, build).direction).toBe("right");
		expect(architecture({ title: "Shop", direction: "down" }, build).direction).toBe("down");
	});

	test("keeps an Edge's explicit id", () => {
		const diagram = architecture({ title: "Shop" }, (d) => {
			const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
			const events = d.node({ id: "shop-events", kind: "queue", title: "Shop events" });
			d.edge(api, events, { kind: "call", id: "publish" });
			d.edge(api, events, { kind: "message" });
		});

		expect(diagram.edges.map((edge) => edge.id)).toEqual(["publish", "shop-api->shop-events"]);
	});

	test("keeps a Node's Links: to an id, or to a document and one of its sections", () => {
		const diagram = architecture({ title: "Shop" }, (d) => {
			d.node({
				id: "shop-api",
				kind: "service",
				title: "Shop API",
				links: [
					{ id: "payments-api" },
					{ doc: "docs/adr/0002-payments.md", label: "Why we pay later" },
					{ doc: "docs/shop.md", section: "Checkout" },
				],
			});
		});

		expect(diagram.nodes).toEqual([
			{
				id: "shop-api",
				kind: "service",
				title: "Shop API",
				links: [
					{ id: "payments-api" },
					{ doc: "docs/adr/0002-payments.md", label: "Why we pay later" },
					{ doc: "docs/shop.md", section: "Checkout" },
				],
			},
		]);
	});

	test("keeps a Node's Rows in order, each a name and an optional value", () => {
		const diagram = architecture({ title: "Shop" }, (d) => {
			d.node({
				id: "shop-db",
				kind: "database",
				title: "Shop database",
				rows: [{ name: "replicas", value: "3" }, { name: "read-only" }],
			});
		});

		expect(diagram.nodes).toEqual([
			{
				id: "shop-db",
				kind: "database",
				title: "Shop database",
				rows: [{ name: "replicas", value: "3" }, { name: "read-only" }],
			},
		]);
	});

	test("ends an Edge at one of a Node's Rows, named through the Node's handle or by ids", () => {
		const diagram = architecture({ title: "Shop" }, (d) => {
			const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
			const events = d.node({
				id: "shop-events",
				kind: "queue",
				title: "Shop events",
				rows: [{ name: "order-placed" }, { name: "order-paid" }],
			});
			const placed = d.edge(api, events.row("order-placed"), { kind: "message" });
			const paid = d.edge({ node: "shop-events", row: "order-paid" }, "shop-api", {
				kind: "message",
			});
			// Default ids name the two Nodes, whatever their Rows.
			expect([placed.id, paid.id]).toEqual(["shop-api->shop-events", "shop-events->shop-api"]);
		});

		expect(diagram.edges).toEqual([
			{
				id: "shop-api->shop-events",
				kind: "message",
				from: "shop-api",
				to: { node: "shop-events", row: "order-placed" },
			},
			{
				id: "shop-events->shop-api",
				kind: "message",
				from: { node: "shop-events", row: "order-paid" },
				to: "shop-api",
			},
		]);
	});

	test("accepts a Node's id in place of its handle", () => {
		const diagram = architecture({ title: "Shop" }, (d) => {
			const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
			d.node({ id: "shop-db", kind: "database", title: "Shop database" });
			const edge = d.edge(api, "shop-db", { kind: "call" });
			expect(edge.id).toBe("shop-api->shop-db");
		});

		expect(diagram.edges).toEqual([
			{ id: "shop-api->shop-db", kind: "call", from: "shop-api", to: "shop-db" },
		]);
	});
});
