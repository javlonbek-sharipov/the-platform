import { describe, expect, test } from "vitest";
import { render } from "../src/index.ts";

/** A valid model, written as JSON, for each test to break in one place. */
function shopJson() {
	return {
		version: 1,
		notation: "architecture",
		title: "Shop",
		direction: "right",
		members: ["web-app", "shop-api", "shop-db"],
		nodes: [
			{ id: "web-app", kind: "client", title: "Web app" },
			{ id: "shop-api", kind: "service", title: "Shop API" },
			{ id: "shop-db", kind: "database", title: "Shop database" },
		],
		groups: [],
		edges: [
			{ id: "web-app->shop-api", kind: "call", from: "web-app", to: "shop-api" },
			{ id: "shop-api->shop-db", kind: "call", from: "shop-api", to: "shop-db" },
		],
		walkthroughs: [],
	};
}

describe("validation", () => {
	test("accepts the valid fixture", () => {
		expect(render(shopJson()).diagnostics).toEqual([]);
	});

	test("reports a model version that this engine can't read, and reads no further", () => {
		const diagram = { ...shopJson(), version: 2, nodes: "anything" };

		expect(render(diagram)).toEqual({
			diagnostics: [
				{
					severity: "error",
					rule: "model-version",
					message: "This engine reads version 1 of the JSON model, not version 2.",
					pointer: "/version",
				},
			],
		});
		expect(render({ ...shopJson(), version: undefined }).diagnostics).toEqual([
			{
				severity: "error",
				rule: "model-version",
				message: "The model has no `version`. This engine reads version 1 of the JSON model.",
				pointer: "/version",
			},
		]);
	});

	test("reports a Notation that this engine doesn't have", () => {
		const diagram = { ...shopJson(), notation: "sequence" };

		expect(render(diagram).diagnostics).toEqual([
			{
				severity: "error",
				rule: "unknown-notation",
				message:
					"The Diagram's Notation is `sequence`, which this engine doesn't have. Its Notations are architecture.",
				pointer: "/notation",
			},
		]);
	});

	test("reports a model that isn't shaped like a Diagram, instead of throwing", () => {
		const diagram = {
			...shopJson(),
			title: 7,
			direction: "left",
			nodes: [{ id: "web-app", kind: "client" }],
			edges: {},
		};

		expect(render(diagram).diagnostics).toEqual([
			{
				severity: "error",
				rule: "model-shape",
				message: "`/title` must be a string.",
				pointer: "/title",
			},
			{
				severity: "error",
				rule: "model-shape",
				message: "`/direction` must be `right` or `down`.",
				pointer: "/direction",
			},
			{
				severity: "error",
				rule: "model-shape",
				message: "`/nodes/0/title` must be a string.",
				pointer: "/nodes/0/title",
			},
			{
				severity: "error",
				rule: "model-shape",
				message: "`/edges` must be a list.",
				pointer: "/edges",
			},
		]);
	});

	test("reports a Diagram that isn't an object", () => {
		expect(render(null).diagnostics).toEqual([
			{
				severity: "error",
				rule: "model-shape",
				message: "A Diagram must be a JSON object.",
				pointer: "",
			},
		]);
	});

	test("reports a Node Kind that the Notation doesn't have, and draws nothing", () => {
		const diagram = shopJson();
		diagram.nodes[1] = { id: "shop-api", kind: "servce", title: "Shop API" };

		expect(render(diagram)).toEqual({
			diagnostics: [
				{
					severity: "error",
					rule: "unknown-kind",
					message:
						"Node `shop-api` has the Kind `servce`, which the architecture Notation doesn't have. Its Node Kinds are person, system, client, gateway, service, worker, function, database, cache, queue, storage and search.",
					pointer: "/nodes/1/kind",
				},
			],
		});
	});

	test("reports an Edge Kind that the Notation doesn't have", () => {
		const diagram = shopJson();
		diagram.edges[0] = { id: "web-app->shop-api", kind: "rest", from: "web-app", to: "shop-api" };

		expect(render(diagram).diagnostics).toEqual([
			{
				severity: "error",
				rule: "unknown-kind",
				message:
					"Edge `web-app->shop-api` has the Kind `rest`, which the architecture Notation doesn't have. Its Edge Kinds are call and message.",
				pointer: "/edges/0/kind",
			},
		]);
	});

	test("reports two Nodes with one id", () => {
		const diagram = shopJson();
		diagram.nodes[2] = { id: "shop-api", kind: "database", title: "Shop database" };
		diagram.edges = [];

		expect(render(diagram).diagnostics).toEqual([
			{
				severity: "error",
				rule: "duplicate-id",
				message: "Two Nodes have the id `shop-api`. Node ids must be unique within a Diagram.",
				pointer: "/nodes/2/id",
			},
		]);
	});

	test("reports two Edges with one id, and asks for explicit ids", () => {
		const diagram = shopJson();
		diagram.edges.push({
			id: "web-app->shop-api",
			kind: "message",
			from: "web-app",
			to: "shop-api",
		});

		expect(render(diagram).diagnostics).toEqual([
			{
				severity: "error",
				rule: "duplicate-id",
				message:
					"Two Edges have the id `web-app->shop-api`. Edge ids must be unique within a Diagram, so give Edges between the same two Nodes ids of their own.",
				pointer: "/edges/2/id",
			},
		]);
	});

	test("reports a Node id that isn't lowercase kebab-case", () => {
		const diagram = shopJson();
		diagram.nodes[2] = { id: "Shop_DB", kind: "database", title: "Shop database" };
		diagram.edges = [];

		expect(render(diagram).diagnostics).toEqual([
			{
				severity: "error",
				rule: "id-format",
				message:
					"Node `Shop_DB` has an id that isn't lowercase kebab-case. Write ids like `payments-api`.",
				pointer: "/nodes/2/id",
			},
		]);
	});

	test("reports an Edge id that isn't lowercase kebab-case, or two ids joined by `->`", () => {
		const diagram = shopJson();
		diagram.edges[1] = { id: "Store orders", kind: "call", from: "shop-api", to: "shop-db" };

		expect(render(diagram).diagnostics).toEqual([
			{
				severity: "error",
				rule: "id-format",
				message:
					"Edge `Store orders` has an id that isn't lowercase kebab-case. Write ids like `payments-api`, or like `checkout-api->payments-api`.",
				pointer: "/edges/1/id",
			},
		]);
	});

	test("reports an Edge end that isn't a Node on the same Diagram", () => {
		const diagram = shopJson();
		diagram.edges = [
			{ id: "mobile-app->shop-api", kind: "call", from: "mobile-app", to: "shop-api" },
			{ id: "shop-api->shop-cache", kind: "call", from: "shop-api", to: "shop-cache" },
		];

		expect(render(diagram).diagnostics).toEqual([
			{
				severity: "error",
				rule: "edge-end",
				message:
					"Edge `mobile-app->shop-api` starts at `mobile-app`, which isn't a Node on this Diagram.",
				pointer: "/edges/0/from",
			},
			{
				severity: "error",
				rule: "edge-end",
				message:
					"Edge `shop-api->shop-cache` ends at `shop-cache`, which isn't a Node on this Diagram.",
				pointer: "/edges/1/to",
			},
		]);
	});

	test("accepts Links to ids and to documents, with sections and labels", () => {
		const diagram = shopJson();
		diagram.nodes[1] = {
			...diagram.nodes[1],
			links: [
				{ id: "payments-api" },
				{ doc: "docs/shop.md", section: "Checkout", label: "How checkout works" },
			],
		} as (typeof diagram.nodes)[number];

		expect(render(diagram).diagnostics).toEqual([]);
	});

	test("reports Links that aren't shaped like Links", () => {
		const diagram = shopJson();
		diagram.nodes[0] = { ...diagram.nodes[0], links: { id: "shop-api" } } as never;
		diagram.nodes[1] = {
			...diagram.nodes[1],
			links: [
				"shop-db",
				{ label: "Nowhere" },
				{ id: "shop-db", doc: "docs/shop.md" },
				{ id: 7 },
				{ doc: "docs/shop.md", label: 7 },
				{ id: "shop-db", section: "Storage" },
				{ doc: "docs/shop.md", section: ["Checkout"] },
				{ term: "Database" },
				{ id: "shop-db", term: "Database" },
			],
		} as never;

		expect(render(diagram).diagnostics).toEqual(
			[
				["/nodes/0/links", "`/nodes/0/links` must be a list."],
				["/nodes/1/links/0", "`/nodes/1/links/0` must be an object."],
				["/nodes/1/links/1", "`/nodes/1/links/1` must have exactly one of `id` and `doc`."],
				["/nodes/1/links/2", "`/nodes/1/links/2` must have exactly one of `id` and `doc`."],
				["/nodes/1/links/3/id", "`/nodes/1/links/3/id` must be a string."],
				["/nodes/1/links/4/label", "`/nodes/1/links/4/label` must be a string."],
				[
					"/nodes/1/links/5/section",
					"`/nodes/1/links/5/section` must be left out: only a Link to a document has sections.",
				],
				["/nodes/1/links/6/section", "`/nodes/1/links/6/section` must be a string."],
				["/nodes/1/links/7", "`/nodes/1/links/7` must have exactly one of `id` and `doc`."],
				["/nodes/1/links/8", "`/nodes/1/links/8` must have exactly one of `id` and `doc`."],
			].map(([pointer, message]) => ({ severity: "error", rule: "model-shape", message, pointer })),
		);
	});

	test("reports a Link to an id that isn't lowercase kebab-case", () => {
		const diagram = shopJson();
		diagram.nodes[1] = { ...diagram.nodes[1], links: [{ id: "Payments API" }] } as never;

		expect(render(diagram).diagnostics).toEqual([
			{
				severity: "error",
				rule: "id-format",
				message:
					"Node `shop-api` has a Link to `Payments API`, which isn't a lowercase kebab-case id. Write ids like `payments-api`.",
				pointer: "/nodes/1/links/0/id",
			},
		]);
	});

	test("accepts ids with digits, and context namespaces", () => {
		const diagram = shopJson();
		diagram.nodes[2] = { id: "billing/s3-archive", kind: "storage", title: "Archive" };
		diagram.edges[1] = {
			id: "shop-api->billing/s3-archive",
			kind: "call",
			from: "shop-api",
			to: "billing/s3-archive",
		};

		expect(render(diagram).diagnostics).toEqual([]);
	});
});
