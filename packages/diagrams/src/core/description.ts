/**
 * The words that describe a Diagram to readers who don't see it: a sentence
 * for each Edge, in its Kind's sentence form, and the description the SVG
 * carries, which lists the Nodes and then the Edges.
 */

import { type AnyDiagram, type AnyEdge, type AnyNode, endNode } from "../authoring/model.ts";
import { definitionOf, type NodeFact, type Notation } from "../notations/notation.ts";
import type { Scene } from "./scene.ts";
import { technologyOf } from "./technology.ts";
import { collapseSpaces } from "./text.ts";

/** What a description says of a Node for each fact, if the Node has it. */
const factOf: Record<NodeFact, (node: AnyNode) => string | undefined> = {
	kind: (node) => node.kind,
	// The drawing shows it beside a logo.
	technology: (node) =>
		node.technology === undefined ? undefined : technologyOf(node.technology).name,
	// The drawing shows these two only as shapes and colors.
	external: (node) => (node.external === true ? "External" : undefined),
	status: (node) => node.status,
};

/**
 * The SVG's description: each Node, by its title, with the facts that its
 * Notation's definition lists, such as its Kind and its status; then each
 * Edge as a sentence. Both lists are in model order.
 */
export function descriptionOf(diagram: AnyDiagram, notation: Notation, scene: Scene): string {
	const crosses = new Map(scene.edges.map((edge) => [edge.id, edge.crosses?.kind]));
	const nodes = diagram.nodes.map((node) => {
		const facts = notation.facts.flatMap((fact) => factOf[fact](node) ?? []);
		return `${collapseSpaces(node.title)} (${facts.join(", ")})`;
	});
	const edges = diagram.edges.map(
		(edge) => `${sentenceOf(diagram, notation, edge, crosses.get(edge.id))}.`,
	);
	return [
		`Nodes: ${nodes.length === 0 ? "none" : nodes.join("; ")}.`,
		`Edges: ${edges.length === 0 ? "none." : edges.join(" ")}`,
	].join(" ");
}

/**
 * An Edge as a sentence: its Kind's sentence form, as in "Checkout API calls
 * Payments API", with each end's roles after its title, as in "Catalog (open
 * host service) is upstream of Ordering (conformist)", then how it travels,
 * by its Technology's name, how much
 * passes over it, whether it crosses between Groups, as its Notation words
 * it, which the drawing shows only by its color and its badge, and its
 * label, as in "Checkout API calls Payments API over grpc at 2k/s across
 * regions: authorize".
 */
export function sentenceOf(
	diagram: AnyDiagram,
	notation: Notation,
	edge: AnyEdge,
	crosses?: string,
): string {
	const titles = new Map(diagram.nodes.map((node) => [node.id, collapseSpaces(node.title)]));
	/**
	 * An end as a sentence names it: its Node's title, then, in parentheses,
	 * the Row it attaches to, if any, and the roles it carries, each by the
	 * name that its Notation gives it, which the drawing shortens to a tag.
	 */
	const name = (which: "from" | "to") => {
		const end = edge[which];
		const title = titles.get(endNode(end)) ?? endNode(end);
		const details = [
			...(typeof end === "string" ? [] : [collapseSpaces(end.row)]),
			...(edge.roles?.[which] ?? []).map((role) => definitionOf(notation.roles, role).name),
		];
		return details.length === 0 ? title : `${title} (${details.join(", ")})`;
	};
	// How the description says that the Edge crosses between Groups of a Kind.
	const crossing =
		crosses === undefined ? undefined : definitionOf(notation.groupKinds, crosses).crossing;
	const sentence = definitionOf(notation.edgeKinds, edge.kind).sentence.replace(
		/\{(from|to)\}/g,
		(_, end: string) => name(end === "from" ? "from" : "to"),
	);
	return [
		sentence,
		...(edge.technology === undefined ? [] : [` over ${technologyOf(edge.technology).name}`]),
		...(edge.rate === undefined ? [] : [` at ${edge.rate}`]),
		...(crossing === undefined ? [] : [` ${crossing}`]),
		...(edge.label === undefined ? [] : [`: ${collapseSpaces(edge.label)}`]),
	].join("");
}
