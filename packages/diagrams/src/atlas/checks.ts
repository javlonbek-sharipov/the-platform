/**
 * The checks that span Diagrams: each id has one Kind and one title across
 * the Atlas, and every Link resolves.
 */

import { readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { Declarations } from "../authoring/declarations.ts";
import type { Diagram, Link, Node } from "../authoring/model.ts";
import { anchorOf, headingAnchors } from "./markdown.ts";
import { type AtlasMessage, list, located } from "./messages.ts";

/** A Diagram that passed validation, with where its module declared each thing. */
export interface CheckedDiagram {
	module: string;
	/** The module's path from the repo root, minus `.diagram.ts`. */
	id: string;
	model: Diagram;
	declarations: Declarations;
}

/** One place where a Diagram draws an id. */
interface Drawing {
	diagram: CheckedDiagram;
	node: Node;
	index: number;
}

/** How each field that an id keeps across the Atlas is named, and what to do when it differs. */
const sameEverywhere = {
	kind: { name: "Kind", fix: "give it one Kind, or give one of them another id" },
	title: { name: "title", fix: "give it one title: define the Node once, in a shared module" },
} as const;

/**
 * An id names one thing across the Atlas, so it has one Kind and one title.
 * Each place that disagrees is reported, with the values that the other
 * Diagrams give it.
 */
export function checkIds(diagrams: CheckedDiagram[]): AtlasMessage[] {
	const drawings = new Map<string, Drawing[]>();
	for (const diagram of diagrams) {
		diagram.model.nodes.forEach((node, index) => {
			drawings.set(node.id, [...(drawings.get(node.id) ?? []), { diagram, node, index }]);
		});
	}
	return [...drawings].flatMap(([id, places]) =>
		(["kind", "title"] as const).flatMap((field) => {
			if (new Set(places.map(({ node }) => node[field])).size < 2) {
				return [];
			}
			const { name, fix } = sameEverywhere[field];
			return places.map(({ diagram, node, index }) => {
				const elsewhere = new Map<string, string[]>();
				for (const other of places) {
					const value = other.node[field];
					if (value !== node[field]) {
						elsewhere.set(value, [...(elsewhere.get(value) ?? []), other.diagram.id]);
					}
				}
				const others = [...elsewhere].map(
					([value, ids]) =>
						`\`${value}\` on the ${ids.length === 1 ? "Diagram" : "Diagrams"} ${list(ids.map((other) => `\`${other}\``))}`,
				);
				return located(diagram.module, diagram.declarations, {
					severity: "error",
					rule: `${field}-conflict`,
					message: `Node \`${id}\` has the ${name} \`${node[field]}\` here, but ${list(others)}. An id names one thing across the Atlas, so ${fix}.`,
					pointer: `/nodes/${index}/${field}`,
				});
			});
		}),
	);
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
