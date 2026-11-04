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

/** A valid model with nested Groups: the web app calls into a region, whose zone holds the database. */
function regionJson() {
	return {
		version: 1,
		notation: "architecture",
		title: "Shop",
		direction: "right",
		members: ["web-app", "eu-west"],
		nodes: [
			{ id: "web-app", kind: "client", title: "Web app" },
			{ id: "shop-api", kind: "service", title: "Shop API" },
			{ id: "shop-db", kind: "database", title: "Shop database" },
		],
		groups: [
			{ id: "eu-west", kind: "region", title: "EU West", members: ["shop-api", "eu-west-a"] },
			{ id: "eu-west-a", kind: "zone", title: "Zone A", members: ["shop-db"] },
		] as { id: string; kind: string; title: string; members: string[] }[],
		edges: [
			{ id: "web-app->shop-api", kind: "call", from: "web-app", to: "shop-api" },
			{ id: "shop-api->shop-db", kind: "call", from: "shop-api", to: "shop-db" },
		],
		walkthroughs: [],
	};
}

/** An error of the nesting rule. */
function nesting(message: string, pointer: string) {
	return { severity: "error", rule: "nesting", message, pointer };
}

describe("validation", () => {
	test("accepts the valid fixture", () => {
		expect(render(shopJson()).diagnostics).toEqual([]);
	});

	test("accepts the valid fixture with nested Groups", () => {
		expect(render(regionJson()).diagnostics).toEqual([]);
	});

	test("reports a Node or a Group that is a member of two parents, or twice of one", () => {
		const diagram = regionJson();
		diagram.members.push("eu-west-a");
		diagram.groups[1]?.members.push("shop-api", "shop-db");

		expect(render(diagram).diagnostics).toEqual([
			nesting(
				"Group `eu-west-a` is a member of both the Diagram and Group `eu-west`. Every Node and Group has exactly one parent: the Diagram, or one Group.",
				"/groups/0/members/1",
			),
			nesting(
				"Node `shop-api` is a member of both Group `eu-west` and Group `eu-west-a`. Every Node and Group has exactly one parent: the Diagram, or one Group.",
				"/groups/1/members/1",
			),
			nesting(
				"Node `shop-db` is listed twice among the members of Group `eu-west-a`. Every Node and Group has exactly one parent: the Diagram, or one Group.",
				"/groups/1/members/2",
			),
		]);
	});

	test("reports a Node or a Group that is a member of no parent", () => {
		const diagram = regionJson();
		diagram.members = ["web-app"];
		diagram.groups[1] = { id: "eu-west-a", kind: "zone", title: "Zone A", members: [] };

		expect(render(diagram).diagnostics).toEqual([
			nesting(
				"Node `shop-db` isn't a member of the Diagram or of any Group. List it among the members of the Diagram, or of one Group.",
				"/nodes/2",
			),
			nesting(
				"Group `eu-west` isn't a member of the Diagram or of any Group. List it among the members of the Diagram, or of one Group.",
				"/groups/0",
			),
		]);
	});

	test("reports a member that isn't a Node or a Group on the Diagram", () => {
		const diagram = regionJson();
		diagram.members.push("mailer");
		diagram.groups[0]?.members.push("shop-cache");

		expect(render(diagram).diagnostics).toEqual([
			nesting(
				"The Diagram has the member `mailer`, which isn't a Node or a Group on this Diagram.",
				"/members/2",
			),
			nesting(
				"Group `eu-west` has the member `shop-cache`, which isn't a Node or a Group on this Diagram.",
				"/groups/0/members/2",
			),
		]);
	});

	test("reports Groups that contain each other in a cycle, and a Group that contains itself", () => {
		const twoGroups = regionJson();
		twoGroups.members = ["web-app"];
		twoGroups.groups[1]?.members.push("eu-west");

		expect(render(twoGroups).diagnostics).toEqual([
			nesting(
				"Groups `eu-west` and `eu-west-a` contain each other. Groups nest as a tree, rooted at the Diagram.",
				"/groups/0/members/1",
			),
		]);

		const threeGroups = regionJson();
		threeGroups.members = ["web-app"];
		threeGroups.groups[1]?.members.push("us-east");
		threeGroups.groups.push(
			{ id: "us-east", kind: "region", title: "US East", members: ["us-east-a"] },
			{ id: "us-east-a", kind: "zone", title: "Zone A", members: ["eu-west-a"] },
		);
		threeGroups.groups[0]?.members.splice(1, 1);
		threeGroups.groups[0]?.members.push("eu-west");

		expect(render(threeGroups).diagnostics).toEqual([
			nesting(
				"Group `eu-west` contains itself. Groups nest as a tree, rooted at the Diagram.",
				"/groups/0/members/1",
			),
			nesting(
				"Groups `eu-west-a`, `us-east` and `us-east-a` contain each other in a cycle. Groups nest as a tree, rooted at the Diagram.",
				"/groups/1/members/1",
			),
		]);
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

	test("reports a Group Kind that the Notation doesn't have", () => {
		const diagram = regionJson();
		diagram.groups[0] = { ...diagram.groups[0], id: "eu-west", kind: "continent" } as never;
		diagram.groups[1] = { ...diagram.groups[1], id: "eu-west-a", kind: "service" } as never;

		expect(render(diagram).diagnostics).toEqual([
			{
				severity: "error",
				rule: "unknown-kind",
				message:
					"Group `eu-west` has the Kind `continent`, which the architecture Notation doesn't have. Its Group Kinds are system, region and zone.",
				pointer: "/groups/0/kind",
			},
			{
				severity: "error",
				rule: "unknown-kind",
				message:
					"Group `eu-west-a` has the Kind `service`, which the architecture Notation doesn't have. Its Group Kinds are system, region and zone.",
				pointer: "/groups/1/kind",
			},
		]);
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

	test("reports two Nodes with one id, and nothing more about it", () => {
		const diagram = shopJson();
		diagram.nodes[2] = { id: "shop-api", kind: "database", title: "Shop database" };
		// As the builder would write it, declaring `shop-api` twice.
		diagram.members[2] = "shop-api";
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

	test("reports a Group with a Node's id or another Group's, and nothing more about it", () => {
		const diagram = regionJson();
		diagram.nodes[1] = { id: "eu-west", kind: "service", title: "Shop API" };
		diagram.groups[1] = { id: "eu-west", kind: "zone", title: "Zone A", members: ["shop-db"] };
		diagram.groups[0] = { ...diagram.groups[0], members: ["eu-west", "eu-west"] } as never;
		diagram.edges = [];

		expect(render(diagram).diagnostics).toEqual([
			{
				severity: "error",
				rule: "duplicate-id",
				message:
					"A Node and a Group have the id `eu-west`. Node and Group ids must be unique within a Diagram.",
				pointer: "/groups/0/id",
			},
			{
				severity: "error",
				rule: "duplicate-id",
				message:
					"Two Groups have the id `eu-west`. Node and Group ids must be unique within a Diagram.",
				pointer: "/groups/1/id",
			},
		]);
	});

	test("reports a Group id that isn't lowercase kebab-case", () => {
		const diagram = regionJson();
		diagram.members[1] = "EU West";
		diagram.groups[0] = { ...diagram.groups[0], id: "EU West" } as never;

		expect(render(diagram).diagnostics).toEqual([
			{
				severity: "error",
				rule: "id-format",
				message:
					"Group `EU West` has an id that isn't lowercase kebab-case. Write ids like `eu-west`.",
				pointer: "/groups/0/id",
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
		diagram.members[2] = "Shop_DB";
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

	test("reports an Edge end that is a Group, since Edges end only at Nodes", () => {
		const diagram = regionJson();
		diagram.edges = [
			{ id: "web-app->eu-west", kind: "call", from: "web-app", to: "eu-west" },
			{ id: "eu-west-a->web-app", kind: "message", from: "eu-west-a", to: "web-app" },
		];

		expect(render(diagram).diagnostics).toEqual([
			{
				severity: "error",
				rule: "edge-end",
				message:
					"Edge `web-app->eu-west` ends at `eu-west`, which is a Group. An Edge starts and ends at Nodes, never at Groups.",
				pointer: "/edges/0/to",
			},
			{
				severity: "error",
				rule: "edge-end",
				message:
					"Edge `eu-west-a->web-app` starts at `eu-west-a`, which is a Group. An Edge starts and ends at Nodes, never at Groups.",
				pointer: "/edges/1/from",
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

	test("accepts a Group's description, and its Links to ids and to documents", () => {
		const diagram = regionJson();
		diagram.groups[0] = {
			...diagram.groups[0],
			description: "Where the shop runs in Europe.",
			links: [{ id: "us-east" }, { doc: "docs/regions.md", section: "EU West", label: "Why" }],
		} as never;

		expect(render(diagram).diagnostics).toEqual([]);
	});

	test("reports Groups that aren't shaped like Groups", () => {
		const diagram = regionJson();
		diagram.groups = [
			{ ...diagram.groups[0], title: 7, description: ["Europe"], links: [{ term: "Region" }] },
			{ ...diagram.groups[1], members: "shop-db" },
			{ id: "us-east", kind: "region", title: "US East", members: [7], links: { id: "eu-west" } },
			"eu-west-b",
		] as never;

		expect(render(diagram).diagnostics).toEqual(
			[
				["/groups/0/title", "`/groups/0/title` must be a string."],
				["/groups/0/description", "`/groups/0/description` must be a string."],
				["/groups/0/links/0", "`/groups/0/links/0` must have exactly one of `id` and `doc`."],
				["/groups/1/members", "`/groups/1/members` must be a list."],
				["/groups/2/members/0", "`/groups/2/members/0` must be an id."],
				["/groups/2/links", "`/groups/2/links` must be a list."],
				["/groups/3", "`/groups/3` must be an object."],
			].map(([pointer, message]) => ({ severity: "error", rule: "model-shape", message, pointer })),
		);
	});

	test("reports a Group's Link to an id that isn't lowercase kebab-case", () => {
		const diagram = regionJson();
		diagram.groups[0] = { ...diagram.groups[0], links: [{ id: "US East" }] } as never;

		expect(render(diagram).diagnostics).toEqual([
			{
				severity: "error",
				rule: "id-format",
				message:
					"Group `eu-west` has a Link to `US East`, which isn't a lowercase kebab-case id. Write ids like `payments-api`.",
				pointer: "/groups/0/links/0/id",
			},
		]);
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
		diagram.members[2] = "billing/s3-archive";
		diagram.edges[1] = {
			id: "shop-api->billing/s3-archive",
			kind: "call",
			from: "shop-api",
			to: "billing/s3-archive",
		};

		expect(render(diagram).diagnostics).toEqual([]);
	});
});
