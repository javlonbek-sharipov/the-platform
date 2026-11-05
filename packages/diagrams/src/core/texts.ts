/**
 * Every text of a Diagram's model, in model order. Validation checks each one
 * for characters that an SVG can't hold, and the drawing checks those it
 * draws for characters the font lacks and for shortening. Both walk this one
 * list, and word their messages from what holds each text and which field it
 * is, so that a text added to the model is a field added here.
 */

import type { AnyDiagram, Link } from "../authoring/model.ts";

/** What holds a text: the Diagram, or a Node, Group, Edge or Walkthrough, by its index and id. */
export type TextOwner =
	| { thing: "Diagram" }
	| { thing: "Node" | "Group" | "Edge" | "Walkthrough"; index: number; id: string };

/**
 * Which of its owner's fields a text is. A Row's name and value name the
 * Row; a Link's document, section and label name its target; and the Row
 * that an Edge end names says which end.
 */
export type TextField =
	| { name: "id" | "title" | "description" | "callout" | "label" | "technology" | "rate" | "note" }
	| { name: "row name" | "row value"; row: string; rowIndex: number }
	| { name: "link doc" | "link section" | "link label" | "link term"; target: string }
	| { name: "end row"; end: "from" | "to" };

export interface ModelText {
	owner: TextOwner;
	field: TextField;
	text: string;
	/** Its JSON Pointer. */
	pointer: string;
}

/** Every text in the model, in model order: what holds it, which field it is, and where. */
export function textsOf(diagram: AnyDiagram): ModelText[] {
	const texts: ModelText[] = [];
	const add = (owner: TextOwner, field: TextField, text: string | undefined, pointer: string) => {
		if (text !== undefined) {
			texts.push({ owner, field, text, pointer });
		}
	};
	const addLinks = (owner: TextOwner, links: Link[] | undefined, at: string) => {
		(links ?? []).forEach((link, index) => {
			const target = link.id ?? link.doc ?? link.term ?? "";
			add(owner, { name: "link term", target }, link.term, `${at}/links/${index}/term`);
			add(owner, { name: "link doc", target }, link.doc, `${at}/links/${index}/doc`);
			add(owner, { name: "link section", target }, link.section, `${at}/links/${index}/section`);
			add(owner, { name: "link label", target }, link.label, `${at}/links/${index}/label`);
		});
	};
	const diagramOwner: TextOwner = { thing: "Diagram" };
	add(diagramOwner, { name: "id" }, diagram.id, "/id");
	add(diagramOwner, { name: "title" }, diagram.title, "/title");
	add(diagramOwner, { name: "description" }, diagram.description, "/description");
	diagram.nodes.forEach((node, index) => {
		const owner: TextOwner = { thing: "Node", index, id: node.id };
		const at = `/nodes/${index}`;
		add(owner, { name: "title" }, node.title, `${at}/title`);
		add(owner, { name: "technology" }, node.technology, `${at}/technology`);
		(node.rows ?? []).forEach((row, rowIndex) => {
			const named = { row: row.name, rowIndex };
			add(owner, { name: "row name", ...named }, row.name, `${at}/rows/${rowIndex}/name`);
			add(owner, { name: "row value", ...named }, row.value, `${at}/rows/${rowIndex}/value`);
		});
		add(owner, { name: "description" }, node.description, `${at}/description`);
		addLinks(owner, node.links, at);
		add(owner, { name: "callout" }, node.callout, `${at}/callout`);
	});
	diagram.groups.forEach((group, index) => {
		const owner: TextOwner = { thing: "Group", index, id: group.id };
		const at = `/groups/${index}`;
		add(owner, { name: "title" }, group.title, `${at}/title`);
		add(owner, { name: "description" }, group.description, `${at}/description`);
		addLinks(owner, group.links, at);
	});
	diagram.edges.forEach((edge, index) => {
		const owner: TextOwner = { thing: "Edge", index, id: edge.id };
		const at = `/edges/${index}`;
		for (const end of ["from", "to"] as const) {
			const named = edge[end];
			if (typeof named !== "string") {
				add(owner, { name: "end row", end }, named.row, `${at}/${end}/row`);
			}
		}
		add(owner, { name: "label" }, edge.label, `${at}/label`);
		add(owner, { name: "technology" }, edge.technology, `${at}/technology`);
		add(owner, { name: "rate" }, edge.rate, `${at}/rate`);
	});
	diagram.walkthroughs.forEach((walkthrough, index) => {
		const owner: TextOwner = { thing: "Walkthrough", index, id: walkthrough.id };
		const at = `/walkthroughs/${index}`;
		add(owner, { name: "title" }, walkthrough.title, `${at}/title`);
		walkthrough.steps.forEach((step, place) => {
			add(owner, { name: "note" }, step.note, `${at}/steps/${place}/note`);
		});
	});
	return texts;
}
