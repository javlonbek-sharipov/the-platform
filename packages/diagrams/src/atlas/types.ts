/** Browser-safe metadata shared with the web component and docs integration. */

/** A glossary entry, preserving Markdown and its repo source for later navigation. */
export interface GlossaryTerm {
	context: string;
	term: string;
	definition: string;
	avoid: string[];
	anchor: string;
	/** Path from the Atlas root, with forward slashes. */
	glossary: string;
	/** One-based line of the bold term in the glossary. */
	line: number;
}

export interface AtlasIndex {
	diagrams: { id: string; title: string; notation: string; svg: string }[];
	/** By id, in code unit order. */
	ids: Record<
		string,
		{ kind: string; title: string; context?: string; asNode: string[]; asGroup: string[] }
	>;
	/** Context order, then glossary source order. */
	terms: GlossaryTerm[];
}
