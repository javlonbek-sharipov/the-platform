/**
 * The JSON Schema that the package ships for the JSON model, used as a tool
 * author would use it: through the package's exports, with a validator of
 * their own. Ajv runs in strict mode, so the schema can't use a keyword that
 * Ajv doesn't know, or one that it would ignore.
 */

import schema from "@the-platform/diagrams/diagram.schema.json" with { type: "json" };
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";

const validator = new Ajv2020({ strict: true, allErrors: true }).compile(schema);

/** What the schema finds wrong with a model: nothing, when the model passes. */
export function schemaErrors(model: unknown): ErrorObject[] {
	return validator(model) ? [] : [...(validator.errors ?? [])];
}

/**
 * Where the schema finds a model wrong: a JSON Pointer for each problem,
 * once each, in Ajv's order. A missing field, or one the schema doesn't
 * allow, is pointed at by its own name, as the core's diagnostics point at it.
 */
export function schemaPointers(model: unknown): string[] {
	const pointers = schemaErrors(model).map(({ instancePath, params }) => {
		const field = params.missingProperty ?? params.additionalProperty;
		return typeof field === "string" ? `${instancePath}/${escaped(field)}` : instancePath;
	});
	return [...new Set(pointers)];
}

/** A field's name as a segment of a JSON Pointer. */
function escaped(field: string): string {
	return field.replaceAll("~", "~0").replaceAll("/", "~1");
}

export { schema };
