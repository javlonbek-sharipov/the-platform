/** The helper for the Atlas config, `diagrams.config.ts` at the repo root. */

import { callerOf, declarationsKey } from "./declarations.ts";
import { recordUnknownOptions, unknownOptions } from "./options.ts";

/**
 * The Atlas config. It has no settings yet: its file marks the repo root, and
 * so the Atlas. Slice 2 adds the bounded contexts that have a glossary.
 */
export type AtlasConfig = Record<string, never>;

/**
 * The config file default-exports what this returns. Beside the config, under
 * keys that JSON leaves out, it records where it was called from, and an error
 * for each option, since the config has none yet, so that lint rejects them.
 */
export function atlas(config: AtlasConfig): AtlasConfig {
	const built = { ...config };
	const position = callerOf(atlas);
	Object.defineProperty(built, declarationsKey, {
		value: position === undefined ? {} : { "": position },
	});
	return recordUnknownOptions(built, unknownOptions(config, { known: [] }, "The Atlas config", ""));
}
