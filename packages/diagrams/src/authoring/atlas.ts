/** The helper for the Atlas config, `diagrams.config.ts` at the repo root. */

/**
 * The Atlas config. It has no settings yet: its file marks the repo root, and
 * so the Atlas. Slice 2 adds the bounded contexts that have a glossary.
 */
export type AtlasConfig = Record<string, never>;

/** The config file default-exports what this returns. */
export function atlas(config: AtlasConfig): AtlasConfig {
	return { ...config };
}
