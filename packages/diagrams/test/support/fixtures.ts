/**
 * Every Diagram the tests keep as a fixture: each module in `test/fixtures/`
 * and the package's example. A fixture module default-exports a Diagram, or
 * exports functions that draw one in a direction. So a fixture that a later
 * ticket adds is checked by every test that uses this list, without the test
 * having to name it.
 */

import { readdirSync } from "node:fs";
import example from "../../docs/example-system.diagram.ts";
import type { Diagram, Direction } from "../../src/index.ts";

const folder = new URL("../fixtures/", import.meta.url);
const directions: Direction[] = ["right", "down"];

function isDiagram(value: unknown): value is Diagram {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { version?: unknown }).version === 1 &&
		typeof (value as { notation?: unknown }).notation === "string"
	);
}

/** Each fixture, named by its module, its export and, for a function, its direction. */
export async function everyFixture(): Promise<[name: string, diagram: Diagram][]> {
	const found: [string, Diagram][] = [["the example", example]];
	const modules = readdirSync(folder)
		.filter((file) => file.endsWith(".ts"))
		.sort();
	for (const file of modules) {
		const exports: Record<string, unknown> = await import(new URL(file, folder).href);
		for (const [name, value] of Object.entries(exports)) {
			if (isDiagram(value)) {
				found.push([`${file}: ${name}`, value]);
			} else if (typeof value === "function") {
				for (const direction of directions) {
					const drawn: unknown = value(direction);
					if (isDiagram(drawn)) {
						found.push([`${file}: ${name}, drawn ${direction}`, drawn]);
					}
				}
			}
		}
	}
	return found;
}
