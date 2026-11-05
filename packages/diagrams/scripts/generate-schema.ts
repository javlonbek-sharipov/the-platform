/**
 * Generates `diagram.schema.json`, the JSON Schema that the package ships for
 * the JSON model, from the definitions of the engine's Notations. So a Kind,
 * a status or a field added to a definition is in the schema once this has
 * run, and a test fails until it has. It reads nothing else, so it gives the
 * same output every time.
 *
 * Usage: node packages/diagrams/scripts/generate-schema.ts [output]
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { notations, schemaOf } from "../src/index.ts";

const output = process.argv[2] ?? fileURLToPath(new URL("../diagram.schema.json", import.meta.url));

/** The widest a line of the shipped schema is, and how wide a tab counts. */
const lineWidth = 100;
const tabWidth = 2;

writeFileSync(output, `${jsonText(schemaOf(notations), 0, 0)}\n`);

/**
 * A value as JSON, as Biome formats the repo's JSON: indented with tabs, and
 * a list of plain values on one line where the line stays within 100
 * columns. `depth` is how far the value's first line is indented, and
 * `taken` how many columns the rest of that line holds: the value's key
 * before it, and a comma after it.
 */
function jsonText(value: unknown, depth: number, taken: number): string {
	const indent = "\t".repeat(depth + 1);
	const close = "\t".repeat(depth);
	if (Array.isArray(value)) {
		const plain = value.every((item) => typeof item !== "object" || item === null);
		const line = `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
		if (value.length === 0 || (plain && depth * tabWidth + taken + line.length <= lineWidth)) {
			return line;
		}
		const items = value.map((item, index) => {
			const comma = index < value.length - 1 ? "," : "";
			return `${indent}${jsonText(item, depth + 1, comma.length)}${comma}`;
		});
		return `[\n${items.join("\n")}\n${close}]`;
	}
	if (typeof value === "object" && value !== null) {
		const entries = Object.entries(value);
		if (entries.length === 0) {
			return "{}";
		}
		const fields = entries.map(([key, field], index) => {
			const comma = index < entries.length - 1 ? "," : "";
			const name = `${JSON.stringify(key)}: `;
			return `${indent}${name}${jsonText(field, depth + 1, name.length + comma.length)}${comma}`;
		});
		return `{\n${fields.join("\n")}\n${close}}`;
	}
	return JSON.stringify(value);
}
