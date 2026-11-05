/** Anchors for the glossary's bold paragraphs, assigned by the Atlas alongside heading anchors. */

import { fileURLToPath } from "node:url";
import type { GlossaryTerm } from "@the-platform/diagrams";
import type { HastPluginEntry } from "satteri";
import { pathIn } from "../repo.ts";

export function glossaryAnchors(root: string, terms: readonly GlossaryTerm[]): HastPluginEntry {
	return ({ fileURL }) => {
		if (fileURL === undefined) return undefined;
		const path = pathIn(root, fileURLToPath(fileURL));
		const entries = new Map(
			terms.filter(({ glossary }) => glossary === path).map((term) => [term.line, term.anchor]),
		);
		return {
			name: "glossary-anchors",
			options: { position: true },
			element: {
				filter: ["p"],
				visit(node, ctx) {
					const anchor = entries.get(node.position?.start.line ?? 0);
					if (anchor !== undefined) ctx.setProperty(node, "id", anchor);
				},
			},
		};
	};
}
