/**
 * The words that describe a Diagram to readers who don't see it: a sentence
 * for each Edge, in its Kind's sentence form, and the description the SVG
 * carries, which lists the Nodes and then the Edges.
 */

import { type Diagram, type Edge, endNode, type RowEnd } from "../authoring/model.ts";
import { architectureEdgeLooks, technologyOf } from "../notations/architecture.ts";
import type { Scene } from "./scene.ts";
import { collapseSpaces } from "./text.ts";

/** How the description says that an Edge crosses between Groups of a Kind. */
const across = { region: "across regions", zone: "across zones" } as const;

/**
 * The SVG's description: each Node, by its title, with its Kind, its
 * Technology's name, which the drawing shows beside a logo, and whether it's
 * External and its status, which the drawing shows only as shapes and colors;
 * then each Edge as a sentence. Both lists are in model order.
 */
export function descriptionOf(diagram: Diagram, scene: Scene): string {
	const crosses = new Map(scene.edges.map((edge) => [edge.id, edge.crosses?.kind]));
	const nodes = diagram.nodes.map((node) => {
		const facts = [
			node.kind,
			...(node.technology === undefined ? [] : [technologyOf(node.technology).name]),
			...(node.external ? ["External"] : []),
			...(node.status === undefined ? [] : [node.status]),
		];
		return `${collapseSpaces(node.title)} (${facts.join(", ")})`;
	});
	const edges = diagram.edges.map((edge) => `${sentenceOf(diagram, edge, crosses.get(edge.id))}.`);
	return [
		`Nodes: ${nodes.length === 0 ? "none" : nodes.join("; ")}.`,
		`Edges: ${edges.length === 0 ? "none." : edges.join(" ")}`,
	].join(" ");
}

/**
 * An Edge as a sentence: its Kind's sentence form, as in "Checkout API calls
 * Payments API", then how it travels, by its Technology's name, how much
 * passes over it, whether it crosses between regions or zones, which the
 * drawing shows only by its color and its badge, and its label, as in
 * "Checkout API calls Payments API over grpc at 2k/s across regions:
 * authorize".
 */
export function sentenceOf(diagram: Diagram, edge: Edge, crosses?: "region" | "zone"): string {
	const titles = new Map(diagram.nodes.map((node) => [node.id, collapseSpaces(node.title)]));
	/** An end as a sentence names it: its Node's title, then the Row it attaches to, if any. */
	const name = (end: string | RowEnd) => {
		const title = titles.get(endNode(end)) ?? endNode(end);
		return typeof end === "string" ? title : `${title} (${collapseSpaces(end.row)})`;
	};
	const sentence = architectureEdgeLooks[edge.kind].sentence.replace(
		/\{(from|to)\}/g,
		(_, end: string) => name(end === "from" ? edge.from : edge.to),
	);
	return [
		sentence,
		...(edge.technology === undefined ? [] : [` over ${technologyOf(edge.technology).name}`]),
		...(edge.rate === undefined ? [] : [` at ${edge.rate}`]),
		...(crosses === undefined ? [] : [` ${across[crosses]}`]),
		...(edge.label === undefined ? [] : [`: ${collapseSpaces(edge.label)}`]),
	].join("");
}
