/** The helper for the Atlas config, `diagrams.config.ts` at the repo root. */

import { callerOf, declarationsKey } from "./declarations.ts";
import { recordUnknownOptions, unknownOptions } from "./options.ts";

/**
 * A bounded context with a glossary. Paths are relative to the Atlas root.
 */
export interface AtlasContext {
	glossary: string;
}

/** Context ids are kebab-case namespace ids, as the Diagrams use them. */
export interface AtlasConfig {
	contexts?: Readonly<Record<string, AtlasContext>>;
}

/**
 * The config file default-exports what this returns. Beside the config, under
 * keys that JSON leaves out, it records where it was called from, and an error
 * for each option it does not know, so that lint rejects misspellings.
 */
export function atlas(config: AtlasConfig): AtlasConfig {
	const built = { ...config };
	const position = callerOf(atlas);
	Object.defineProperty(built, declarationsKey, {
		value: position === undefined ? {} : { "": position },
	});
	return recordUnknownOptions(
		built,
		unknownOptions(config, { known: ["contexts"] }, "The Atlas config", ""),
	);
}
