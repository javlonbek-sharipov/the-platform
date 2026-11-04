/**
 * The words that describe a Diagram to readers who don't see it: a sentence
 * for each Edge, in its Kind's sentence form, and the description the SVG
 * carries, which lists the Nodes and then the Edges.
 */

import { type Diagram, type Edge, endNode, type RowEnd } from "../authoring/model.ts";
import { architectureEdgeLooks } from "../notations/architecture.ts";
import { collapseSpaces } from "./text.ts";

/**
 * The SVG's description: each Node, by its title, with its Kind, and whether
 * it's External and its status, which the drawing shows only as shapes and
 * colors; then each Edge as a sentence. Both lists are in model order.
 */
export function descriptionOf(diagram: Diagram): string {
	const nodes = diagram.nodes.map((node) => {
		const facts = [
			node.kind,
			...(node.external ? ["External"] : []),
			...(node.status === undefined ? [] : [node.status]),
		];
		return `${collapseSpaces(node.title)} (${facts.join(", ")})`;
	});
	const edges = diagram.edges.map((edge) => `${sentenceOf(diagram, edge)}.`);
	return [
		`Nodes: ${nodes.length === 0 ? "none" : nodes.join("; ")}.`,
		`Edges: ${edges.length === 0 ? "none." : edges.join(" ")}`,
	].join(" ");
}

/** An Edge in its Kind's sentence form, as in "Checkout API calls Payments API". */
export function sentenceOf(diagram: Diagram, edge: Edge): string {
	const titles = new Map(diagram.nodes.map((node) => [node.id, collapseSpaces(node.title)]));
	/** An end as a sentence names it: its Node's title, then the Row it attaches to, if any. */
	const name = (end: string | RowEnd) => {
		const title = titles.get(endNode(end)) ?? endNode(end);
		return typeof end === "string" ? title : `${title} (${collapseSpaces(end.row)})`;
	};
	return architectureEdgeLooks[edge.kind].sentence.replace(/\{(from|to)\}/g, (_, end: string) =>
		name(end === "from" ? edge.from : edge.to),
	);
}
