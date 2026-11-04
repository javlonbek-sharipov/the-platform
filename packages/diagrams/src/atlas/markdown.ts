/**
 * Just enough Markdown to resolve a Link's section: the anchors of a
 * document's headings, as GitHub makes them. Only ATX headings (`#` to
 * `######`) count, and lines inside code fences are skipped.
 */

/** The anchor of every heading in `markdown`. A repeated anchor gets `-1`, `-2`, and so on. */
export function headingAnchors(markdown: string): Set<string> {
	const anchors = new Set<string>();
	const repeats = new Map<string, number>();
	let fence: { marker: string; length: number } | undefined;
	for (const line of markdown.split(/\r?\n/)) {
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
	}
	return anchors;
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
