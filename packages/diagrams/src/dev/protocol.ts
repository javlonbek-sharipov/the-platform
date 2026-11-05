import type { AtlasMessage } from "../atlas/messages.ts";
import type { AtlasIndex } from "../atlas/types.ts";

/** One completed rebuild. Missing SVGs leave the last good drawing visible. */
export interface PreviewUpdate {
	revision: number;
	diagrams: { id: string; title: string; svg?: string; messages: AtlasMessage[] }[];
	messages: AtlasMessage[];
	index?: AtlasIndex;
}
