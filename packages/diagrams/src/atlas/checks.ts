/**
 * The checks that span Diagrams: each id has one Kind and one title across
 * the Atlas, whether it's drawn as a Node or as a Group, and every Link
 * resolves.
 */

import { readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { Declarations } from "../authoring/declarations.ts";
import type { Diagram, Link } from "../authoring/model.ts";
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

/** Something a Diagram draws under an id, as a Node or as a Group, and where the model holds it. */
interface Thing {
	/** `Node` or `Group`, as messages name it. */
	thing: string;
	id: string;
	kind: string;
	title: string;
	links?: Link[];
	/** Its JSON Pointer, such as `/groups/0`. */
	pointer: string;
}

/** One place where a Diagram draws an id. */
interface Drawing {
	diagram: CheckedDiagram;
	drawn: Thing;
}

/** Every Node and Group a Diagram draws, Nodes first, each in model order. */
function thingsOf(model: Diagram): Thing[] {
	return [
		...model.nodes.map((node, index) => ({ thing: "Node", ...node, pointer: `/nodes/${index}` })),
		...model.groups.map((group, index) => ({
			thing: "Group",
			...group,
			pointer: `/groups/${index}`,
		})),
	];
}

/** How each field that an id keeps across the Atlas is named, and what to do when it differs. */
const sameEverywhere = {
	kind: { name: "Kind", fix: () => "give it one Kind, or give one of them another id" },
	title: {
		name: "title",
		fix: (thing: string) => `give it one title: define the ${thing} once, in a shared module`,
	},
} as const;

/**
 * An id names one thing across the Atlas, so it has one Kind and one title,
 * whether a Diagram draws it as a Node or as a Group. Each place that
 * disagrees is reported, with the values that the other Diagrams give it.
 */
export function checkIds(diagrams: CheckedDiagram[]): AtlasMessage[] {
	const drawings = new Map<string, Drawing[]>();
	for (const diagram of diagrams) {
		for (const drawn of thingsOf(diagram.model)) {
			drawings.set(drawn.id, [...(drawings.get(drawn.id) ?? []), { diagram, drawn }]);
		}
	}
	return [...drawings].flatMap(([id, places]) =>
		(["kind", "title"] as const).flatMap((field) => {
			if (new Set(places.map(({ drawn }) => drawn[field])).size < 2) {
				return [];
			}
			const { name, fix } = sameEverywhere[field];
			return places.map(({ diagram, drawn }) => {
				const elsewhere = new Map<string, string[]>();
				for (const other of places) {
					const value = other.drawn[field];
					if (value !== drawn[field]) {
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
					message: `${drawn.thing} \`${id}\` has the ${name} \`${drawn[field]}\` here, but ${list(others)}. An id names one thing across the Atlas, so ${fix(drawn.thing)}.`,
					pointer: `${drawn.pointer}/${field}`,
				});
			});
		}),
	);
}

/**
 * Every Link must resolve: a Link to an id, to an id in `drawn`; a Link to a
 * document, to a file in the repo and, when it names a section, to a heading
 * in that file.
 *
 * `drawn` holds the ids that any Diagram draws, including one with errors of
 * its own, so that those errors don't also show up as broken Links.
 */
export function checkLinks(
	root: string,
	diagrams: CheckedDiagram[],
	drawn: ReadonlySet<string>,
): AtlasMessage[] {
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
		thingsOf(model).flatMap(({ thing, id, links, pointer }) =>
			(links ?? []).flatMap((link, linkIndex) => {
				const problem = problemWith(link);
				return problem === undefined
					? []
					: [
							located(module, declarations, {
								severity: "error",
								rule: "broken-link",
								message: `${thing} \`${id}\` has a Link to ${problem}.`,
								pointer: `${pointer}/links/${linkIndex}`,
							}),
						];
			}),
		),
	);
}
