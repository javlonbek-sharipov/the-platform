import { readdirSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { render } from "../src/index.ts";
import everyField from "./fixtures/every-field.json" with { type: "json" };
import everyKind from "./fixtures/every-kind.ts";
import { schemaErrors, schemaPointers } from "./support/schema.ts";

const fixtureFolder = new URL("./fixtures/", import.meta.url);

/**
 * Every model in the core's test fixtures, found by reading the fixtures'
 * folder, so that a fixture added later is checked too. A fixture is a
 * module that exports Diagrams, or functions that build one for a direction,
 * which are called for both directions.
 */
async function fixtureModels(): Promise<[name: string, model: unknown][]> {
	const models: [string, unknown][] = [];
	for (const file of readdirSync(fixtureFolder).sort()) {
		const exports: Record<string, unknown> = file.endsWith(".json")
			? await import(new URL(file, fixtureFolder).href, { with: { type: "json" } })
			: await import(new URL(file, fixtureFolder).href);
		for (const [name, value] of Object.entries(exports)) {
			if (typeof value === "function") {
				for (const direction of ["right", "down"]) {
					models.push([`${file}: ${name}("${direction}")`, value(direction)]);
				}
			} else if (typeof value === "object" && value !== null && "version" in value) {
				models.push([`${file}: ${name}`, value]);
			}
		}
	}
	return models;
}

/**
 * A copy of the every-field model, broken in one place: the value at
 * `pointer` replaced by `value`, or removed when `value` is undefined.
 */
function broken(pointer: string, value: unknown): unknown {
	if (pointer === "") {
		return value;
	}
	const model: unknown = structuredClone(everyField);
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

	["a Node that isn't an object", "/nodes/0", "shopper", "model-shape"],
	["a Node without an id", "/nodes/0/id", undefined, "model-shape"],
	["a Node id that isn't kebab-case", "/nodes/0/id", "Shopper", "id-format"],
	["a Node without a Kind", "/nodes/1/kind", undefined, "model-shape"],
	["a Node Kind the Notation doesn't have", "/nodes/2/kind", "servce", "unknown-kind"],
	["a Node without a title", "/nodes/3/title", undefined, "model-shape"],
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
];

describe("the JSON Schema", () => {
	test("rejects each broken model where the core does", () => {
		for (const [what, pointer, value, rule] of brokenModels) {
			const model = broken(pointer, value);

			expect.soft(schemaPointers(model), what).toContain(pointer);
			expect
				.soft(render(model).diagnostics, what)
				.toContainEqual(expect.objectContaining({ severity: "error", rule, pointer }));
		}
	});

	test("passes every core test fixture's model", async () => {
		const models = await fixtureModels();
		expect(models.length).toBeGreaterThanOrEqual(16);
		for (const [name, model] of models) {
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
});
