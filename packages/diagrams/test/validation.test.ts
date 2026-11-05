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

	test("draws a model that leaves `direction` out to the right, the default, exactly as one that says so", () => {
		const { direction, ...withoutDirection } = shopJson();
		expect(direction).toBe("right");

		const drawn = render(withoutDirection);

		expect(drawn.diagnostics).toEqual([]);
		expect(drawn.scene?.nodes.map(({ id, box }) => [id, box.x, box.y])).toEqual([
			["web-app", 24, 24],
			["shop-api", 296, 24],
			["shop-db", 568, 24],
		]);
		expect(drawn.svg).toBe(render(shopJson()).svg);
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

	test("reports each field that the model doesn't have, such as a misspelled one, and lists the fields it does", () => {
		const diagram = {
			...regionJson(),
			legend: "Shop",
			nodes: [
				{ id: "web-app", kind: "client", title: "Web app", extrenal: true },
				{
					id: "shop-api",
					kind: "service",
					title: "Shop API",
					rows: [{ name: "replicas", unit: "pods" }],
					links: [{ id: "shop-db", title: "Its database" }],
				},
				{ id: "shop-db", kind: "database", title: "Shop database" },
			],
			groups: [
				{ ...regionJson().groups[0], color: "blue" },
				{ id: "eu-west-a", kind: "zone", title: "Zone A", members: ["shop-db"] },
			],
			edges: [
				{ id: "web-app->shop-api", kind: "call", from: "web-app", to: "shop-api", lable: "Orders" },
				{
					id: "shop-api->shop-db",
					kind: "call",
					from: { node: "shop-api", row: "replicas", side: "right" },
					to: "shop-db",
				},
			],
		};

		expect(render(diagram).diagnostics).toEqual(
			[
				[
					"/legend",
					"a Diagram",
					"`version`, `notation`, `id`, `title`, `description`, `direction`, `members`, `nodes`, `groups`, `edges` and `walkthroughs`",
				],
				[
					"/nodes/0/extrenal",
					"a Node",
					"`id`, `kind`, `title`, `technology`, `external`, `status`, `rows`, `description`, `links` and `callout`",
				],
				["/nodes/1/rows/0/unit", "a Row", "`name` and `value`"],
				["/nodes/1/links/0/title", "a Link", "`id`, `doc`, `section` and `label`"],
				[
					"/groups/0/color",
					"a Group",
					"`id`, `kind`, `title`, `members`, `description` and `links`",
				],
				[
					"/edges/0/lable",
					"an Edge",
					"`id`, `kind`, `from`, `to`, `label`, `technology` and `rate`",
				],
				["/edges/1/from/side", "an Edge end at a Row", "`node` and `row`"],
			].map(([pointer, thing, fields]) => ({
				severity: "error",
				rule: "model-shape",
				message: `\`${pointer}\` must be left out: ${thing} has no such field. Its fields are ${fields}.`,
				pointer,
			})),
		);
	});

	test("points at a field whose name holds a slash or a tilde, escaped as JSON Pointers escape them", () => {
		const diagram = shopJson();
		diagram.nodes[0] = { ...diagram.nodes[0], "replicas/zone~a": "3" } as never;

		expect(render(diagram).diagnostics).toMatchObject([
			{ rule: "model-shape", pointer: "/nodes/0/replicas~1zone~0a" },
		]);
	});

	test("reports Walkthroughs, which this engine doesn't play yet, so that none is silently dropped", () => {
		const diagram = {
			...shopJson(),
			walkthroughs: [{ id: "checkout", title: "Checkout", steps: [{ node: "shop-api" }] }],
		};

		expect(render(diagram).diagnostics).toEqual([
			{
				severity: "error",
				rule: "model-shape",
				message:
					"`/walkthroughs` must be an empty list: this engine doesn't play Walkthroughs yet.",
				pointer: "/walkthroughs",
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

	test("reports an Edge that keeps its default id when another Edge joins the same two Nodes, and asks for explicit ids", () => {
		const diagram = shopJson();
		diagram.edges.push({ id: "shop-events", kind: "message", from: "web-app", to: "shop-api" });

		expect(render(diagram).diagnostics).toEqual([
			{
				severity: "error",
				rule: "default-edge-id",
				message:
					"Edge `web-app->shop-api` keeps the default id, which Edge `shop-events` would get too, since both join `web-app` to `shop-api`. Give each Edge between the same two Nodes an id of its own.",
				pointer: "/edges/0/id",
			},
		]);
	});

	test("accepts two Edges between the same two Nodes once both have ids of their own", () => {
		const diagram = shopJson();
		diagram.edges[0] = { id: "web-app-calls", kind: "call", from: "web-app", to: "shop-api" };
		diagram.edges.push({ id: "shop-events", kind: "message", from: "web-app", to: "shop-api" });

		expect(render(diagram).diagnostics).toEqual([]);
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

	test("accepts a Diagram's description and a Node's, and reports one that isn't text", () => {
		const described = {
			...shopJson(),
			description: "How the shop takes orders.",
			nodes: shopJson().nodes.map((node) => ({ ...node, description: `What ${node.title} does.` })),
		};
		expect(render(described).diagnostics).toEqual([]);

		const diagram = { ...described, description: 7 } as Record<string, unknown>;
		diagram.nodes = [{ ...described.nodes[0], description: ["Buys"] }, ...described.nodes.slice(1)];
		expect(render(diagram).diagnostics).toEqual(
			[
				["/description", "`/description` must be a string."],
				["/nodes/0/description", "`/nodes/0/description` must be a string."],
			].map(([pointer, message]) => ({ severity: "error", rule: "model-shape", message, pointer })),
		);
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

	test("accepts Rows, and Edges that start or end at them", () => {
		const diagram = shopJson();
		diagram.nodes[1] = { ...diagram.nodes[1], rows: [{ name: "replicas", value: "3" }] } as never;
		diagram.nodes[2] = {
			...diagram.nodes[2],
			rows: [{ name: "orders", value: "table" }, { name: "read-only" }],
		} as never;
		diagram.edges[1] = {
			id: "shop-api->shop-db",
			kind: "call",
			from: { node: "shop-api", row: "replicas" },
			to: { node: "shop-db", row: "orders" },
		} as never;

		expect(render(diagram).diagnostics).toEqual([]);
	});

	test("reports an Edge end at a Row that its Node doesn't have", () => {
		const diagram = shopJson();
		diagram.nodes[1] = { ...diagram.nodes[1], rows: [{ name: "read replicas" }] } as never;
		diagram.nodes[2] = {
			...diagram.nodes[2],
			rows: [{ name: "orders" }, { name: "stock" }],
		} as never;
		diagram.edges = [
			{
				id: "web-app->shop-api",
				kind: "call",
				from: { node: "web-app", row: "session" },
				to: { node: "shop-api", row: "replicas" },
			},
			{
				id: "shop-api->shop-db",
				kind: "call",
				from: "shop-api",
				to: { node: "shop-db", row: "order" },
			},
		] as never;

		expect(render(diagram).diagnostics).toEqual([
			{
				severity: "error",
				rule: "edge-end",
				message:
					"Edge `web-app->shop-api` starts at the Row `session` of `web-app`, which has no Rows.",
				pointer: "/edges/0/from/row",
			},
			{
				severity: "error",
				rule: "edge-end",
				message:
					"Edge `web-app->shop-api` ends at the Row `replicas` of `shop-api`, which has no such Row. Its only Row is `read replicas`.",
				pointer: "/edges/0/to/row",
			},
			{
				severity: "error",
				rule: "edge-end",
				message:
					"Edge `shop-api->shop-db` ends at the Row `order` of `shop-db`, which has no such Row. Its Rows are `orders` and `stock`.",
				pointer: "/edges/1/to/row",
			},
		]);
	});

	test("reports two Rows of one Node with the same name, since an Edge end names a Row by its name", () => {
		const diagram = shopJson();
		diagram.nodes[1] = {
			...diagram.nodes[1],
			rows: [{ name: "region" }, { name: "replicas" }, { name: "region", value: "eu-west-1" }],
		} as never;
		diagram.nodes[2] = { ...diagram.nodes[2], rows: [{ name: "region" }] } as never;

		expect(render(diagram).diagnostics).toEqual([
			{
				severity: "error",
				rule: "duplicate-row",
				message:
					"Node `shop-api` has two Rows named `region`. A Node's Rows need names of their own, since an Edge end names a Row by its name.",
				pointer: "/nodes/1/rows/2/name",
			},
		]);
	});

	test("reports Rows and Row ends that aren't shaped like them", () => {
		const diagram = shopJson();
		diagram.nodes[0] = { ...diagram.nodes[0], rows: { name: "session" } } as never;
		diagram.nodes[1] = {
			...diagram.nodes[1],
			rows: ["replicas", { value: "3" }, { name: "port", value: 8080 }],
		} as never;
		diagram.edges = [
			{ id: "web-app->shop-api", kind: "call", from: 7, to: { node: "shop-api" } },
			{ id: "shop-api->shop-db", kind: "call", from: { row: "port" }, to: ["shop-db"] },
		] as never;

		expect(render(diagram).diagnostics).toEqual(
			[
				["/nodes/0/rows", "`/nodes/0/rows` must be a list."],
				["/nodes/1/rows/0", "`/nodes/1/rows/0` must be an object."],
				["/nodes/1/rows/1/name", "`/nodes/1/rows/1/name` must be a string."],
				["/nodes/1/rows/2/value", "`/nodes/1/rows/2/value` must be a string."],
				[
					"/edges/0/from",
					"`/edges/0/from` must be a Node's id, or an object with `node` and `row`.",
				],
				["/edges/0/to/row", "`/edges/0/to/row` must be a string."],
				["/edges/1/from/node", "`/edges/1/from/node` must be a string."],
				["/edges/1/to", "`/edges/1/to` must be a Node's id, or an object with `node` and `row`."],
			].map(([pointer, message]) => ({ severity: "error", rule: "model-shape", message, pointer })),
		);
	});

	test("reports an External flag that isn't true or false", () => {
		const diagram = shopJson();
		diagram.nodes[1] = { ...diagram.nodes[1], external: "yes" } as (typeof diagram.nodes)[number];

		expect(render(diagram).diagnostics).toEqual([
			{
				severity: "error",
				rule: "model-shape",
				message: "`/nodes/1/external` must be `true` or `false`.",
				pointer: "/nodes/1/external",
			},
		]);
	});

	test("reports a status that the Notation doesn't have", () => {
		const diagram = shopJson();
		diagram.nodes[1] = { ...diagram.nodes[1], status: "broken" } as (typeof diagram.nodes)[number];

		expect(render(diagram)).toEqual({
			diagnostics: [
				{
					severity: "error",
					rule: "unknown-status",
					message:
						"Node `shop-api` has the status `broken`, which the architecture Notation doesn't have. Its statuses are ok, degraded, down and unknown.",
					pointer: "/nodes/1/status",
				},
			],
		});
	});

	test("reports a status that isn't a string", () => {
		const diagram = shopJson();
		diagram.nodes[1] = {
			...diagram.nodes[1],
			status: 3,
		} as unknown as (typeof diagram.nodes)[number];

		expect(render(diagram).diagnostics).toEqual([
			{
				severity: "error",
				rule: "model-shape",
				message: "`/nodes/1/status` must be a string.",
				pointer: "/nodes/1/status",
			},
		]);
	});

	test("reports a callout with no text", () => {
		for (const callout of ["", " \n\t", 7]) {
			const diagram = shopJson();
			diagram.nodes[1] = {
				...diagram.nodes[1],
				callout,
			} as unknown as (typeof diagram.nodes)[number];

			expect(render(diagram).diagnostics, JSON.stringify(callout)).toEqual([
				{
					severity: "error",
					rule: "model-shape",
					message: "`/nodes/1/callout` must be a string with some text in it.",
					pointer: "/nodes/1/callout",
				},
			]);
		}
	});

	test("accepts an Edge's label, Technology and rate", () => {
		const diagram = shopJson();
		diagram.edges[1] = {
			...diagram.edges[1],
			label: "Reads orders",
			technology: "postgres",
			rate: "2k/s",
		} as (typeof diagram.edges)[number];

		expect(render(diagram).diagnostics).toEqual([]);
	});

	test("accepts a rate that is a number, an optional k or M, a slash, and s, min or h", () => {
		for (const rate of ["2k/s", "30/min", "1.5M/h", "0/s", "12/h", "7k/min", "0.25/s"]) {
			const diagram = shopJson();
			diagram.edges[1] = { ...diagram.edges[1], rate } as (typeof diagram.edges)[number];

			expect(render(diagram).diagnostics, rate).toEqual([]);
		}
	});

	test("reports a rate written any other way", () => {
		const rates = ["fast", "2k", "2 k/s", "2K/s", "2k/sec", "/s", "-2/s", "2/d", "1e3/s", " 2/s"];
		for (const rate of [...rates, ".5/s", "2./s", "2k/s/s", ""]) {
			const diagram = shopJson();
			diagram.edges[1] = { ...diagram.edges[1], rate } as (typeof diagram.edges)[number];

			expect(render(diagram).diagnostics, rate).toEqual([
				{
					severity: "error",
					rule: "rate-format",
					message: `Edge \`shop-api->shop-db\` has the rate \`${rate}\`, which isn't written as a rate. Write a number, an optional \`k\` or \`M\`, a slash, and \`s\`, \`min\` or \`h\`, as in \`2k/s\` or \`30/min\`.`,
					pointer: "/edges/1/rate",
				},
			]);
		}
	});

	test("accepts any Technology written as a slug, whether or not it has a logo", () => {
		for (const technology of ["grpc", "postgres", "aws-lambda", "s3", "http2", "our-own-bus"]) {
			const diagram = shopJson();
			diagram.edges[1] = { ...diagram.edges[1], technology } as (typeof diagram.edges)[number];

			expect(render(diagram).diagnostics, technology).toEqual([]);
		}
	});

	test("reports a Technology that isn't written as a slug", () => {
		for (const technology of [
			"PostgreSQL",
			"node.js",
			"c++",
			"google cloud",
			"-grpc",
			"a--b",
			"",
		]) {
			const diagram = shopJson();
			diagram.edges[1] = { ...diagram.edges[1], technology } as (typeof diagram.edges)[number];

			expect(render(diagram).diagnostics, technology).toEqual([
				{
					severity: "error",
					rule: "technology-format",
					message: `Edge \`shop-api->shop-db\` has the Technology \`${technology}\`, which isn't a slug. Write a Technology as lowercase words joined by hyphens, such as \`postgres\` or \`grpc\`.`,
					pointer: "/edges/1/technology",
				},
			]);
		}
	});

	test("accepts a Node's Technology written as a slug, and reports one written any other way", () => {
		for (const technology of ["postgres", "aws-lambda", "go", "our-own-db"]) {
			const diagram = shopJson();
			diagram.nodes[2] = { ...diagram.nodes[2], technology } as (typeof diagram.nodes)[number];

			expect(render(diagram).diagnostics, technology).toEqual([]);
		}
		for (const technology of ["PostgreSQL", "node.js", "google cloud", ""]) {
			const diagram = shopJson();
			diagram.nodes[2] = { ...diagram.nodes[2], technology } as (typeof diagram.nodes)[number];

			expect(render(diagram).diagnostics, technology).toEqual([
				{
					severity: "error",
					rule: "technology-format",
					message: `Node \`shop-db\` has the Technology \`${technology}\`, which isn't a slug. Write a Technology as lowercase words joined by hyphens, such as \`postgres\` or \`grpc\`.`,
					pointer: "/nodes/2/technology",
				},
			]);
		}
		const diagram = shopJson();
		diagram.nodes[2] = { ...diagram.nodes[2], technology: 7 } as never;
		expect(render(diagram).diagnostics).toEqual([
			{
				severity: "error",
				rule: "model-shape",
				message: "`/nodes/2/technology` must be a string.",
				pointer: "/nodes/2/technology",
			},
		]);
	});

	test("reports an Edge's label, Technology or rate that isn't shaped like one", () => {
		const cases: [field: string, value: unknown, what: string][] = [
			["label", "", "a string with some text in it"],
			["label", " \n\t", "a string with some text in it"],
			["label", 7, "a string with some text in it"],
			["technology", ["grpc"], "a string"],
			["rate", 2000, "a string"],
		];
		for (const [field, value, what] of cases) {
			const diagram = shopJson();
			diagram.edges[1] = {
				...diagram.edges[1],
				[field]: value,
			} as unknown as (typeof diagram.edges)[number];

			expect(render(diagram).diagnostics, `${field}: ${JSON.stringify(value)}`).toEqual([
				{
					severity: "error",
					rule: "model-shape",
					message: `\`/edges/1/${field}\` must be ${what}.`,
					pointer: `/edges/1/${field}`,
				},
			]);
		}
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

/**
 * A valid model with text in every field that holds text, nested Groups,
 * Rows and Links included. Its Edge from the Shop API leaves from the Row
 * `zone`, so that the Row `replicas` can be renamed alone.
 */
function textJson() {
	const diagram = regionJson();
	return {
		...diagram,
		id: "docs/shop",
		description: "How the shop takes orders.",
		nodes: [
			{ id: "web-app", kind: "client", title: "Web app" },
			{
				id: "shop-api",
				kind: "service",
				title: "Shop API",
				description: "Takes orders.",
				callout: "SPOF",
				rows: [{ name: "replicas", value: "3" }, { name: "zone" }],
				links: [{ doc: "docs/shop.md", section: "Checkout", label: "How checkout works" }],
			},
			{ id: "shop-db", kind: "database", title: "Shop database", rows: [{ name: "orders" }] },
		],
		groups: [
			{
				id: "eu-west",
				kind: "region",
				title: "EU West",
				members: ["shop-api", "eu-west-a"],
				description: "Where the shop runs in Europe.",
				links: [{ id: "us-east", label: "The US" }],
			},
			{ id: "eu-west-a", kind: "zone", title: "Zone A", members: ["shop-db"] },
		],
		edges: [
			{
				id: "web-app->shop-api",
				kind: "call",
				from: "web-app",
				to: "shop-api",
				label: "Places orders",
			},
			{
				id: "shop-api->shop-db",
				kind: "call",
				from: { node: "shop-api", row: "zone" },
				to: { node: "shop-db", row: "orders" },
			},
		],
	};
}

/** Sets the value at a JSON Pointer that names an existing field. */
function setAt(model: object, pointer: string, value: unknown): void {
	const path = pointer.split("/").slice(1);
	const field = path.pop() ?? "";
	const parent = path.reduce((at, segment) => (at as Record<string, object>)[segment] ?? {}, model);
	(parent as Record<string, unknown>)[field] = value;
}

/** An error of the rule about characters that an SVG can't hold. */
function invalidCharacter(message: string, pointer: string) {
	return { severity: "error", rule: "invalid-character", message, pointer };
}

describe("text that an SVG can't hold", () => {
	test("accepts the valid fixture with text in every field", () => {
		expect(render(textJson()).diagnostics).toEqual([]);
	});

	test("reports a title holding a control character, which would make the SVG invalid XML", () => {
		const diagram = textJson();
		diagram.nodes[1] = { ...diagram.nodes[1], title: "Shop\u0007API" } as never;

		expect(render(diagram)).toEqual({
			diagnostics: [
				invalidCharacter(
					"Node `shop-api`'s title has a control character, U+0007, which an SVG can't hold. Remove it.",
					"/nodes/1/title",
				),
			],
		});
	});

	test("reports such a character in every field that holds text, naming the field", () => {
		const fields: [pointer: string, text: string, where: string][] = [
			["/id", "docs/sh\u0007op", "The Diagram's id"],
			["/title", "Sh\u0007op", "The Diagram's title"],
			["/description", "How\u0007", "The Diagram's description"],
			["/nodes/1/description", "Takes\u0007", "Node `shop-api`'s description"],
			["/nodes/1/callout", "SP\u0007OF", "Node `shop-api`'s callout"],
			[
				"/nodes/1/rows/0/name",
				"repl\u0007icas",
				"The name of Node `shop-api`'s Row `repl\\u0007icas`",
			],
			["/nodes/1/rows/0/value", "\u00073", "The value of Node `shop-api`'s Row `replicas`"],
			[
				"/nodes/1/links/0/doc",
				"docs/sh\u0007op.md",
				"The document of Node `shop-api`'s Link to `docs/sh\\u0007op.md`",
			],
			[
				"/nodes/1/links/0/section",
				"Check\u0007out",
				"The section of Node `shop-api`'s Link to `docs/shop.md`",
			],
			[
				"/nodes/1/links/0/label",
				"How\u0007",
				"The label of Node `shop-api`'s Link to `docs/shop.md`",
			],
			["/groups/0/title", "EU\u0007West", "Group `eu-west`'s title"],
			["/groups/0/description", "Europe\u0007", "Group `eu-west`'s description"],
			[
				"/groups/0/links/0/label",
				"The\u0007US",
				"The label of Group `eu-west`'s Link to `us-east`",
			],
			["/edges/0/label", "Places\u0007orders", "Edge `web-app->shop-api`'s label"],
		];
		for (const [pointer, text, where] of fields) {
			const diagram = textJson();
			setAt(diagram, pointer, text);

			expect(render(diagram).diagnostics, pointer).toEqual([
				invalidCharacter(
					`${where} has a control character, U+0007, which an SVG can't hold. Remove it.`,
					pointer,
				),
			]);
		}
	});

	test("reports such a character in a Row's name, and in each Edge end that names the Row", () => {
		const diagram = textJson();
		setAt(diagram, "/nodes/1/rows/1/name", "zo\u001bne");
		setAt(diagram, "/edges/1/from/row", "zo\u001bne");

		expect(render(diagram).diagnostics).toEqual([
			invalidCharacter(
				"The name of Node `shop-api`'s Row `zo\\u001Bne` has a control character, U+001B, which an SVG can't hold. Remove it.",
				"/nodes/1/rows/1/name",
			),
			invalidCharacter(
				"The Row that Edge `shop-api->shop-db` starts at has a control character, U+001B, which an SVG can't hold. Remove it.",
				"/edges/1/from/row",
			),
		]);
	});

	test("names every such character once, whether it's a control character, half a surrogate pair, or U+FFFE or U+FFFF", () => {
		const cases: [title: string, found: string][] = [
			["Shop\u0000API", "a control character, U+0000,"],
			["Shop \ud83d", "an unpaired surrogate, U+D83D,"],
			["\udc00Shop", "an unpaired surrogate, U+DC00,"],
			["Shop\ufffe", "a noncharacter, U+FFFE,"],
			["Shop\uffff", "a noncharacter, U+FFFF,"],
		];
		for (const [title, found] of cases) {
			const diagram = textJson();
			setAt(diagram, "/nodes/1/title", title);

			expect(render(diagram).diagnostics, found).toEqual([
				invalidCharacter(
					`Node \`shop-api\`'s title has ${found} which an SVG can't hold. Remove it.`,
					"/nodes/1/title",
				),
			]);
		}

		const diagram = textJson();
		setAt(diagram, "/nodes/1/title", "\u001b[31mShop\u0007 API\u0007\ud800");
		expect(render(diagram).diagnostics).toEqual([
			invalidCharacter(
				"Node `shop-api`'s title has characters that an SVG can't hold: U+001B, U+0007 and U+D800. Remove them.",
				"/nodes/1/title",
			),
		]);
	});

	test("accepts every character that XML allows, such as tabs, line breaks, DEL and emoji", () => {
		for (const title of [
			"Shop\tAPI",
			"Shop\nAPI\r",
			"Shop\u007f",
			"Shop\u0085",
			"Shop\ufffd",
			"Shop 🛒",
		]) {
			const diagram = textJson();
			setAt(diagram, "/nodes/1/title", title);

			const errors = render(diagram).diagnostics.filter(({ severity }) => severity === "error");
			expect(errors, JSON.stringify(title)).toEqual([]);
		}
	});
});
