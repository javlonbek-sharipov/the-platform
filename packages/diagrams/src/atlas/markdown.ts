/**
 * The Atlas's accepted section identities, shared with document publishers.
 * Only ATX headings (`#` to `######`) count, outside code fences. A publisher
 * uses their source lines to map these identities to its rendered heading ids.
 */

/** Section identities and source lines, so a publisher can map them to its actual heading ids. */
export function documentHeadings(markdown: string): { anchor: string; line: number }[] {
	const anchors = new Set<string>();
	const headings: { anchor: string; line: number }[] = [];
	const repeats = new Map<string, number>();
	let fence: { marker: string; length: number } | undefined;
	for (const [index, line] of markdown.split(/\r?\n/).entries()) {
		const fenceLine = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		if (fence !== undefined) {
			const [, marker = "", rest = ""] = fenceLine ?? [];
			if (marker[0] === fence.marker && marker.length >= fence.length && rest.trim() === "") {
				fence = undefined;
			}
			continue;
		}
		if (fenceLine !== null) {
			const marker = fenceLine[1] ?? "";
			fence = { marker: marker[0] ?? "", length: marker.length };
			continue;
		}
		const heading = /^ {0,3}#{1,6}(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/.exec(line);
		if (heading === null) {
			continue;
		}
		const anchor = anchorOf(heading[1] ?? "");
		let unique = anchor;
		while (anchors.has(unique)) {
			const count = (repeats.get(anchor) ?? 0) + 1;
			repeats.set(anchor, count);
			unique = `${anchor}-${count}`;
		}
		anchors.add(unique);
		headings.push({ anchor: unique, line: index + 1 });
	}
	return headings;
}

/** The identity of every accepted ATX section, with duplicate suffixes retained. */
export function headingAnchors(markdown: string): Set<string> {
	return new Set(documentHeadings(markdown).map(({ anchor }) => anchor));
}

/**
 * A heading's anchor, as GitHub makes it from the heading's text: links keep
 * only their text, then letters are lowercased, punctuation is dropped, and
 * each space becomes a hyphen. An anchor is its own anchor.
 */
export function anchorOf(text: string): string {
	return text
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
		.replaceAll(" ", "-");
}
