/** The checks that span Diagrams: every Link in the Atlas resolves. */

import { readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { Declarations } from "../authoring/declarations.ts";
import type { Diagram, Link } from "../authoring/model.ts";
import { anchorOf, headingAnchors } from "./markdown.ts";
import { type AtlasMessage, located } from "./messages.ts";

/** A Diagram that passed validation, with where its module declared each thing. */
export interface CheckedDiagram {
	module: string;
	model: Diagram;
	declarations: Declarations;
}

/**
 * Every Link must resolve: a Link to an id, to an id that some Diagram
 * draws; a Link to a document, to a file in the repo and, when it names a
 * section, to a heading in that file.
 */
export function checkLinks(root: string, diagrams: CheckedDiagram[]): AtlasMessage[] {
	const drawn = new Set(diagrams.flatMap(({ model }) => model.nodes.map((node) => node.id)));
	const anchors = new Map<string, Set<string>>();
	const anchorsIn = (file: string) => {
		const known = anchors.get(file) ?? headingAnchors(readFileSync(file, "utf8"));
		anchors.set(file, known);
		return known;
	};
	/** What's wrong with a Link, as the end of a sentence that starts "has a Link to". */
	const problemWith = (link: Link): string | undefined => {
		if (link.id !== undefined) {
			return drawn.has(link.id) ? undefined : `\`${link.id}\`, which no Diagram in the Atlas draws`;
		}
		const file = resolve(root, link.doc);
		const path = relative(root, file);
		const inRepo = path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
		if (!inRepo || statSync(file, { throwIfNoEntry: false })?.isFile() !== true) {
			return `\`${link.doc}\`, which isn't a file in the repo`;
		}
		if (link.section !== undefined && !anchorsIn(file).has(anchorOf(link.section))) {
			return `\`${link.doc}\`, which has no heading \`${link.section}\``;
		}
		return undefined;
	};
	return diagrams.flatMap(({ module, model, declarations }) =>
		model.nodes.flatMap((node, index) =>
			(node.links ?? []).flatMap((link, linkIndex) => {
				const problem = problemWith(link);
				return problem === undefined
					? []
					: [
							located(module, declarations, {
								severity: "error",
								rule: "broken-link",
								message: `Node \`${node.id}\` has a Link to ${problem}.`,
								pointer: `/nodes/${index}/links/${linkIndex}`,
							}),
						];
			}),
		),
	);
}
