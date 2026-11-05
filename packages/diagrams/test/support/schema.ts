/**
 * The JSON Schema that the package ships for the JSON model, used as a tool
 * author would use it: through the package's exports, with a validator of
 * their own. Ajv runs in strict mode, so the schema can't use a keyword that
 * Ajv doesn't know, or one that it would ignore.
 */

import schema from "@the-platform/diagrams/diagram.schema.json" with { type: "json" };
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";

/** A schema, compiled: what it finds wrong with a model, and where. */
export interface SchemaChecker {
	/** What the schema finds wrong with a model: nothing, when the model passes. */
	errors(model: unknown): ErrorObject[];
	/**
	 * Where the schema finds a model wrong: a JSON Pointer for each problem,
	 * once each, in Ajv's order. A missing field, or one the schema doesn't
	 * allow, is pointed at by its own name, as the core's diagnostics point at it.
	 */
	pointers(model: unknown): string[];
}

/** Compiles a JSON Schema for the model, such as one generated for other Notations. */
export function schemaChecker(schema: object): SchemaChecker {
	const validator = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
	const errors = (model: unknown) => (validator(model) ? [] : [...(validator.errors ?? [])]);
	return {
		errors,
		pointers(model) {
			const pointers = errors(model).map(({ instancePath, params }) => {
				const field = params.missingProperty ?? params.additionalProperty;
				return typeof field === "string" ? `${instancePath}/${escaped(field)}` : instancePath;
			});
			return [...new Set(pointers)];
		},
	};
}

const shipped = schemaChecker(schema);

/** What the shipped schema finds wrong with a model: nothing, when the model passes. */
export const schemaErrors = shipped.errors;

/** Where the shipped schema finds a model wrong. */
export const schemaPointers = shipped.pointers;

/** A field's name as a segment of a JSON Pointer. */
function escaped(field: string): string {
	return field.replaceAll("~", "~0").replaceAll("/", "~1");
}

export { schema };
