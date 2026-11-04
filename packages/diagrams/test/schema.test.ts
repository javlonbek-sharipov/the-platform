import { readdirSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { schemaErrors } from "./support/schema.ts";

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

describe("the JSON Schema", () => {
	test("passes every core test fixture's model", async () => {
		const models = await fixtureModels();
		expect(models.length).toBeGreaterThanOrEqual(16);
		for (const [name, model] of models) {
			expect(schemaErrors(model), name).toEqual([]);
		}
	});
});
