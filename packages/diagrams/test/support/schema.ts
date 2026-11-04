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

export { schema };
