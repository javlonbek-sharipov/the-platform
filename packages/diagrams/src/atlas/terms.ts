/** Pure glossary lookup shared by Atlas checks and consumers of its index. */
import type { TermLink } from "../authoring/model.ts";
import type { GlossaryTerm } from "./types.ts";

/** Term names ignore case and runs of whitespace; punctuation remains significant. */
export function termName(name: string): string {
	return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Resolve against an explicit context, or the owning id's `context` in the Atlas index. */
export function termOf(
	terms: readonly GlossaryTerm[],
	link: TermLink,
	context?: string,
): GlossaryTerm | undefined {
	return terms.find(
		(entry) =>
			entry.context === (link.context ?? context) && termName(entry.term) === termName(link.term),
	);
}
