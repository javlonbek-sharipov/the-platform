/** Glossary diagnostics, scoped to the namespace that owns each drawn text. */
import { endNode, namespaceOf } from "../authoring/model.ts";
import { type TextOwner, textsOf } from "../core/texts.ts";
import type { Notation } from "../notations/notation.ts";
import { notations } from "../notations/notations.ts";
import type { CheckedDiagram } from "./checks.ts";
import { type AtlasMessage, located } from "./messages.ts";
import type { GlossaryTerm } from "./types.ts";

export function checkLanguage(
	diagrams: CheckedDiagram[],
	terms: readonly GlossaryTerm[],
): AtlasMessage[] {
	const words = terms.flatMap((term) =>
		term.avoid
			.filter((word) => word !== "")
			.map((word) => ({
				term,
				word,
				pattern: new RegExp(
					`(?<![\\p{L}\\p{M}\\p{N}_])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{M}\\p{N}_])`,
					"iu",
				),
			})),
	);
	return diagrams.flatMap((diagram) => {
		const notation: Notation | undefined = notations.find(
			({ name }) => name === diagram.model.notation,
		);
		if (notation === undefined) return [];
		const { model } = diagram;
		const contextOf = (id: string) => namespaceOf(model, id, notation);
		const own = model.groups
			.filter(
				(group) =>
					notation.groupKinds[group.kind]?.namespace === true && model.members.includes(group.id),
			)
			.map((group) => group.id);
		const all = [
			...new Set([...model.nodes, ...model.groups].flatMap(({ id }) => contextOf(id) ?? [])),
		];
		const diagramContext = own.length === 1 ? own : all.length === 1 ? all : [];
		const contextsOf = (owner: TextOwner): string[] => {
			if (owner.thing === "Diagram") return diagramContext;
			if (owner.thing !== "Edge")
				return contextOf(owner.id) === undefined ? [] : [contextOf(owner.id) as string];
			const edge = model.edges[owner.index];
			return edge === undefined
				? []
				: [...new Set([edge.from, edge.to].flatMap((end) => contextOf(endNode(end)) ?? []))];
		};
		return textsOf(model).flatMap(({ owner, field, text, pointer }) => {
			if (!["title", "row name", "row value", "label"].includes(field.name)) return [];
			const contexts = contextsOf(owner);
			return words.flatMap(({ term, word, pattern }) =>
				!contexts.includes(term.context) || !pattern.test(text)
					? []
					: [
							located(diagram.module, diagram.declarations, {
								severity: "warning",
								rule: "glossary-avoid",
								pointer,
								message: `${owner.thing === "Diagram" ? "The Diagram" : `${owner.thing} \`${owner.id}\``}'s ${field.name} uses \`${word}\`, which context \`${term.context}\`'s glossary avoids. Use \`${term.term}\` instead.`,
							}),
						],
			);
		});
	});
}
