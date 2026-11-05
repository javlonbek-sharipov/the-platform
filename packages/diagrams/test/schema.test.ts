import { describe, expect, test } from "vitest";
import {
	architectureNotation,
	architectureStatuses,
	edgeKindsOf,
	groupKindsOf,
	nodeKindsOf,
	render,
} from "../src/index.ts";
import everyField from "./fixtures/every-field.json" with { type: "json" };
import everyKind from "./fixtures/every-kind.ts";
import { everyFixture } from "./support/fixtures.ts";
import { schema, schemaErrors, schemaPointers } from "./support/schema.ts";

/**
 * A copy of the every-field model, changed at each pointer: the value there
 * replaced by the one given, or removed when that is undefined.
 */
function broken(...changes: [pointer: string, value: unknown][]): unknown {
	let model: unknown = structuredClone(everyField);
	for (const [pointer, value] of changes) {
		if (pointer === "") {
			model = value;
			continue;
		}
		const path = pointer
			.split("/")
			.slice(1)
			.map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
		const field = path.pop() ?? "";
		const parent = path.reduce(
			(at, segment) => (at as Record<string, unknown>)[segment],
			model,
		) as Record<string, unknown>;
		if (value === undefined) {
			Reflect.deleteProperty(parent, field);
		} else {
			parent[field] = value;
		}
	}
	return model;
}

/**
 * Models broken in one place each, by replacing or removing the value at a
 * pointer, with the rule that the core reports there. The core and the
 * schema must both reject each one, at that pointer.
 */
const brokenModels: [what: string, pointer: string, value: unknown, rule: string][] = [
	["a Diagram that isn't an object", "", ["shopper"], "model-shape"],
	["a Notation the engine doesn't have", "/notation", "sequence", "unknown-notation"],
	["a Diagram without a title", "/title", undefined, "model-shape"],
	["a title that isn't a string", "/title", 7, "model-shape"],
	["a Diagram id that isn't a string", "/id", 7, "model-shape"],
	["a direction other than right or down", "/direction", "left", "model-shape"],
	["a Diagram without members", "/members", undefined, "model-shape"],
	["a member that isn't a string", "/members/0", 7, "model-shape"],
	["a member that isn't written as an id", "/members/0", "Shopper", "nesting"],
	["a Diagram without Nodes", "/nodes", undefined, "model-shape"],
	["Groups that aren't a list", "/groups", {}, "model-shape"],
	["a Diagram without Edges", "/edges", undefined, "model-shape"],
	["a Diagram without Walkthroughs", "/walkthroughs", undefined, "model-shape"],
	[
		"a Walkthrough, which the engine doesn't play yet",
		"/walkthroughs",
		[{ id: "checkout", title: "Checkout", steps: [{ node: "web-app" }] }],
		"model-shape",
	],

	["a Node that isn't an object", "/nodes/0", "shopper", "model-shape"],
	["a Node without an id", "/nodes/0/id", undefined, "model-shape"],
	["a Node id that isn't kebab-case", "/nodes/0/id", "Shopper", "id-format"],
	["a Node without a Kind", "/nodes/1/kind", undefined, "model-shape"],
	["a Node Kind the Notation doesn't have", "/nodes/2/kind", "servce", "unknown-kind"],
	["a Node without a title", "/nodes/3/title", undefined, "model-shape"],
	["a Node Technology that isn't a slug", "/nodes/1/technology", "React", "technology-format"],
	["a Node Technology that isn't a string", "/nodes/3/technology", ["postgres"], "model-shape"],
	["an External flag that isn't true or false", "/nodes/4/external", "yes", "model-shape"],
	["a status the Notation doesn't have", "/nodes/2/status", "broken", "unknown-status"],
	["a status that isn't a string", "/nodes/2/status", 3, "model-shape"],
	["Rows that aren't a list", "/nodes/2/rows", { name: "replicas" }, "model-shape"],
	["a Row that isn't an object", "/nodes/2/rows/1", "orders", "model-shape"],
	["a Row without a name", "/nodes/2/rows/0/name", undefined, "model-shape"],
	["a Row value that isn't a string", "/nodes/2/rows/0/value", 3, "model-shape"],
	["a callout with no text", "/nodes/2/callout", " \t", "model-shape"],
	["Links that aren't a list", "/nodes/1/links", { doc: "docs/orders.md" }, "model-shape"],
	["a Link that isn't an object", "/nodes/2/links/0", "orders-db", "model-shape"],
	[
		"a Link to both an id and a document",
		"/nodes/2/links/0",
		{ id: "orders-db", doc: "docs/orders.md" },
		"model-shape",
	],
	["a Link to neither an id nor a document", "/nodes/2/links/0", { label: "x" }, "model-shape"],
	["a Link to a glossary term", "/nodes/2/links/0", { term: "Order" }, "model-shape"],
	["a section on a Link to an id", "/nodes/2/links/0/section", "Storage", "model-shape"],
	["a Link to an id that isn't kebab-case", "/nodes/2/links/0/id", "Orders DB", "id-format"],
	["a Link's label that isn't a string", "/nodes/2/links/0/label", 7, "model-shape"],
	["a Link's document that isn't a string", "/nodes/2/links/1/doc", 7, "model-shape"],
	["a Link's section that isn't a string", "/nodes/1/links/0/section", ["x"], "model-shape"],

	["a Group that isn't an object", "/groups/1", "eu-west-a", "model-shape"],
	["a Group id that isn't kebab-case", "/groups/1/id", "Zone A", "id-format"],
	["a Group Kind the Notation doesn't have", "/groups/0/kind", "continent", "unknown-kind"],
	["a Group without a title", "/groups/1/title", undefined, "model-shape"],
	["a Group without members", "/groups/1/members", undefined, "model-shape"],
	["a Group member that isn't a string", "/groups/0/members/0", 7, "model-shape"],
	["a Group description that isn't a string", "/groups/0/description", ["x"], "model-shape"],
	["a Group's Link to a glossary term", "/groups/0/links/0", { term: "Region" }, "model-shape"],

	["an Edge that isn't an object", "/edges/0", "shopper->web-app", "model-shape"],
	["an Edge without an id", "/edges/0/id", undefined, "model-shape"],
	["an Edge id that isn't written as an id", "/edges/3/id", "Charges cards", "id-format"],
	["an Edge without a Kind", "/edges/0/kind", undefined, "model-shape"],
	["an Edge Kind the Notation doesn't have", "/edges/0/kind", "rest", "unknown-kind"],
	["an Edge without a start", "/edges/0/from", undefined, "model-shape"],
	["an Edge end that isn't an id or a Row end", "/edges/0/to", ["web-app"], "model-shape"],
	["an Edge end that isn't written as an id", "/edges/0/to", "Web app", "edge-end"],
	["a Row end without a Row", "/edges/2/from/row", undefined, "model-shape"],
	["a Row end without a Node", "/edges/2/to/node", undefined, "model-shape"],
	["a label with no text", "/edges/1/label", "", "model-shape"],
	["a label that isn't a string", "/edges/2/label", 7, "model-shape"],
	["a Technology that isn't a slug", "/edges/1/technology", "HTTPS", "technology-format"],
	["a Technology that isn't a string", "/edges/3/technology", ["kafka"], "model-shape"],
	["a rate written another way", "/edges/1/rate", "30 per second", "rate-format"],
	["a rate without a digit before its point", "/edges/1/rate", ".5/s", "rate-format"],
	["a rate that isn't a string", "/edges/3/rate", 1500, "model-shape"],

	["a field that a Diagram doesn't have", "/legend", "Orders", "model-shape"],
	["a Diagram description that isn't a string", "/description", ["x"], "model-shape"],
	["a misspelled Node field", "/nodes/4/extrenal", true, "model-shape"],
	["a Node description that isn't a string", "/nodes/2/description", 7, "model-shape"],
	["a field that a Row doesn't have", "/nodes/2/rows/0/unit", "pods", "model-shape"],
	["a field that a Link doesn't have", "/nodes/2/links/0/title", "Its database", "model-shape"],
	["a field that a Group doesn't have", "/groups/0/color", "blue", "model-shape"],
	["a misspelled Edge field", "/edges/1/lable", "Places orders", "model-shape"],
	["a field that a Row end doesn't have", "/edges/2/from/side", "right", "model-shape"],
	["a field whose name holds a slash", "/nodes/0/a~1b", "x", "model-shape"],
];

describe("the JSON Schema", () => {
	test("passes every core test fixture's model", async () => {
		const fixtures = await everyFixture();
		expect(fixtures.map(([name]) => name)).toContain("every-field.json: default");
		for (const [name, model] of fixtures) {
			expect(schemaErrors(model), name).toEqual([]);
		}
	});

	test("passes a generated model with every field the engine reads, which the core draws", () => {
		expect(schemaErrors(everyField)).toEqual([]);
		const { diagnostics, svg } = render(everyField);
		expect(diagnostics).toEqual([]);
		expect(svg).toContain('<g data-edge="charges"');
	});

	test("requires `version` to be 1, as the core does", () => {
		for (const version of [2, 0, 1.5, "1", null, undefined]) {
			const model = { ...everyKind, version };

			expect(schemaPointers(model), String(version)).toContain("/version");
			expect(render(model).diagnostics, String(version)).toMatchObject([
				{ severity: "error", rule: "model-version", pointer: "/version" },
			]);
		}
	});

	test("has the Notation's Kinds and statuses, no more and no fewer", () => {
		const { $defs } = schema;
		expect($defs.node.properties.kind.enum).toEqual(nodeKindsOf(architectureNotation));
		expect($defs.group.properties.kind.enum).toEqual(groupKindsOf(architectureNotation));
		expect($defs.edge.properties.kind.enum).toEqual(edgeKindsOf(architectureNotation));
		expect($defs.node.properties.status.enum).toEqual(architectureStatuses);
	});

	test("allows each object the fields that the core does, and no others", () => {
		const { $defs } = schema;
		const objects: [what: string, pointer: string, properties: object[]][] = [
			["a Diagram", "", [schema.properties]],
			["a Node", "/nodes/2", [$defs.node.properties]],
			["a Row", "/nodes/2/rows/0", [$defs.row.properties]],
			["a Group", "/groups/0", [$defs.group.properties]],
			["an Edge", "/edges/1", [$defs.edge.properties]],
			["an Edge end at a Row", "/edges/2/from", [$defs.rowEnd.properties]],
			["a Link", "/nodes/2/links/0", [$defs.idLink.properties, $defs.docLink.properties]],
		];
		for (const [what, pointer, properties] of objects) {
			// The core's message about a field it doesn't know lists the fields it does.
			const at = `${pointer}/not-a-field`;
			const { message } = render(broken([at, "x"])).diagnostics.find((d) => d.pointer === at) ?? {};
			const listed = /Its fields are (.+)\.$/.exec(message ?? "")?.[1]?.match(/`[^`]+`/g) ?? [];

			expect(listed.length, what).toBeGreaterThan(1);
			expect(new Set(properties.flatMap((fields) => Object.keys(fields))), what).toEqual(
				new Set(listed.map((field) => field.slice(1, -1))),
			);
		}
	});

	test("rejects each broken model where the core does", () => {
		for (const [what, pointer, value, rule] of brokenModels) {
			const model = broken([pointer, value]);

			expect.soft(schemaPointers(model), what).toContain(pointer);
			expect
				.soft(render(model).diagnostics, what)
				.toContainEqual(expect.objectContaining({ severity: "error", rule, pointer }));
		}
	});

	test("rejects text that an SVG can't hold in every field that holds text, where the core does", () => {
		const texts = [
			"/id",
			"/title",
			"/description",
			"/nodes/1/title",
			"/nodes/2/description",
			"/nodes/2/callout",
			"/nodes/2/rows/0/name",
			"/nodes/2/rows/0/value",
			"/nodes/1/links/0/doc",
			"/nodes/1/links/0/section",
			"/nodes/1/links/0/label",
			"/nodes/2/links/0/label",
			"/groups/0/title",
			"/groups/0/description",
			"/groups/0/links/0/section",
			"/edges/1/label",
			"/edges/2/from/row",
		];
		// A control character, half a surrogate pair, and a noncharacter.
		for (const text of ["Sh\u0007op", "Shop \ud83d", "Shop\uffff"]) {
			for (const pointer of texts) {
				const model = broken([pointer, text]);
				const what = `${JSON.stringify(text)} at ${pointer}`;

				expect.soft(schemaPointers(model), what).toContain(pointer);
				expect
					.soft(render(model).diagnostics, what)
					.toContainEqual(expect.objectContaining({ rule: "invalid-character", pointer }));
			}
		}
	});

	test("passes text with any character that XML allows, such as tabs, DEL and emoji, as the core does", () => {
		for (const text of [
			"Shop\tAPI\r\n",
			"Shop\u007f",
			"Shop\u0085",
			"Shop\ufffd",
			"Shop 🛒",
			"店",
		]) {
			const model = broken(["/nodes/2/rows/0/value", text]);

			expect(schemaErrors(model), JSON.stringify(text)).toEqual([]);
			const errors = render(model).diagnostics.filter(({ severity }) => severity === "error");
			expect(errors, JSON.stringify(text)).toEqual([]);
		}
	});

	test("passes models that break the rules it can't express, which the core reports, and names those rules in its description", () => {
		const cases: [what: string, rule: string, model: unknown][] = [
			["two Nodes with one id", "duplicate-id", broken(["/nodes/1/id", "shopper"])],
			["a Node and a Group with one id", "duplicate-id", broken(["/groups/1/id", "orders-db"])],
			["two Edges with one id", "duplicate-id", broken(["/edges/3/id", "shopper->web-app"])],
			[
				"two Rows of one Node with one name",
				"duplicate-row",
				broken(["/nodes/2/rows/1/name", "replicas"]),
			],
			["an Edge end at no Node", "edge-end", broken(["/edges/0/from", "mailer"])],
			["an Edge end at a Group", "edge-end", broken(["/edges/0/to", "eu-west"])],
			["an Edge end at a Row its Node lacks", "edge-end", broken(["/edges/2/to/row", "stock"])],
			["a member that names nothing", "nesting", broken(["/members/0", "mailer"])],
			["a Node with two parents", "nesting", broken(["/groups/1/members/0", "orders-api"])],
			["a Node with no parent", "nesting", broken(["/members", ["shopper", "web-app", "eu-west"]])],
			[
				"Groups that contain each other",
				"nesting",
				broken(
					["/members", ["shopper", "web-app", "card-network"]],
					["/groups/1/members", ["orders-db", "eu-west"]],
				),
			],
			[
				"an Edge that keeps its default id while another joins the same two Nodes",
				"default-edge-id",
				broken(["/edges/3/from", "web-app"], ["/edges/3/to", "orders-api"]),
			],
		];
		for (const [what, rule, model] of cases) {
			expect(schemaErrors(model), what).toEqual([]);
			expect(render(model).diagnostics, what).toContainEqual(
				expect.objectContaining({ severity: "error", rule }),
			);
			expect(schema.description, what).toContain(`\`${rule}\``);
		}
		// Lint checks these across the Atlas, where one model alone can't break them.
		for (const rule of ["kind-conflict", "title-conflict", "broken-link"]) {
			expect(schema.description, rule).toContain(`\`${rule}\``);
		}
	});
});
