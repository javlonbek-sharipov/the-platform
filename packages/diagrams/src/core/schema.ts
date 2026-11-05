/**
 * The JSON Schema of the JSON model, made from the Notations' definitions,
 * so that a Kind, a status or a field added to a definition is in the schema
 * too. The package ships the one made from the engine's own Notations, as
 * `diagram.schema.json`, which `pnpm generate:schema` writes.
 *
 * A model that fails the schema fails validation too, at the same pointer.
 */

import type { AnyDiagram, AnyEdge, AnyGroup, AnyNode } from "../authoring/model.ts";
import {
	edgeKindsOf,
	groupKindsOf,
	hasField,
	type Notation,
	nodeKindsOf,
	statusesOf,
} from "../notations/notation.ts";
import { formats } from "./validate.ts";

/** A JSON Schema, or a part of one. */
type Schema = { [keyword: string]: unknown };

/** The schema of an object of the model: one property for each field it may have. */
interface ObjectSchema {
	description: string;
	type: "object";
	properties: Record<string, Schema>;
	required: string[];
	additionalProperties: false;
}

/** What the schema holds for one Notation: what its Diagrams' Nodes, Groups and Edges may be. */
export interface NotationSchema {
	description: string;
	type: "object";
	properties: Record<"nodes" | "groups" | "edges", Schema>;
	$defs: Record<"node" | "group" | "edge", ObjectSchema>;
}

/**
 * The schema of a Diagram in any of some Notations. Its `$defs` name each
 * part of the model that the Notations share, and hold each Notation's own
 * parts under the Notation's name, `Name`.
 */
export interface DiagramSchema<Name extends string = string> {
	$schema: string;
	title: string;
	description: string;
	type: "object";
	properties: Record<keyof AnyDiagram, Schema>;
	required: string[];
	additionalProperties: false;
	allOf: Schema[];
	$defs: Record<string, Schema> & Record<Name, NotationSchema>;
}

const description = `A Diagram, in version 1 of the JSON model that @the-platform/diagrams reads. A tool that generates Diagrams can check its output against this schema, then default-export the JSON from a \`<name>.diagram.ts\` module, where the Diagram joins the Atlas like any other.

A Diagram's Notation decides which Kinds and statuses its Nodes, Groups and Edges may have, and which fields. The schema checks each Diagram against its own Notation's.

A model that fails this schema fails the engine's validation too. But passing this schema doesn't make a Diagram valid. Some rules relate one part of the model to another, which JSON Schema can't express. The engine's validation checks them, and reports each under its rule's name:

- \`duplicate-id\`: Node and Group ids are unique within a Diagram, in one namespace, and each Edge id is unique among its Edges.
- \`duplicate-row\`: the Rows of one Node have names of their own, since an Edge end names a Row by its name.
- \`edge-end\`: each Edge end names a Node on the Diagram, never a Group, and an end at a Row names one of that Node's Rows.
- \`edge-end-kind\`: each Edge starts and ends at Nodes of Kinds that its own Kind may join.
- \`nesting\`: each member names a Node or a Group on the Diagram, every Node and Group is a member of exactly one parent, the Diagram or one Group, and so Groups nest as a tree.
- \`default-edge-id\`: an Edge whose id is its default name, its two Nodes' ids joined by \`->\`, keeps it only while no other Edge joins the same two Nodes.

\`diagrams lint\` checks the Atlas as a whole too:

- \`kind-conflict\` and \`title-conflict\`: an id names one thing across the Atlas, with one Kind and one title on every Diagram that draws it, as a Node or as a Group.
- \`broken-link\`: every Link resolves, to an id that some Diagram draws, or to a file inside the repo and, with a \`section\`, to one of its headings.`;

const id = { $ref: "#/$defs/id" };
const text = { $ref: "#/$defs/text" };
const someText = { $ref: "#/$defs/someText" };
const technology = { $ref: "#/$defs/technology" };
const links = {
	description: '"See also" pointers, which aren\'t drawn.',
	type: "array",
	items: { $ref: "#/$defs/link" },
};

/** The parts of the model that every Notation's Diagrams share. */
const shared: Record<string, Schema> = {
	id: {
		description:
			"Lowercase kebab-case words, such as `payments-api`, optionally namespaced by a context, as in `billing/order`.",
		type: "string",
		pattern: formats.id,
	},
	text: {
		description:
			"Text that an SVG can hold. XML forbids some characters even written as character references, so no SVG can hold them: the control characters from U+0000 to U+001F other than tab, line feed and carriage return; halves of surrogate pairs on their own, from U+D800 to U+DFFF; and U+FFFE and U+FFFF. The engine reports them as `invalid-character`.",
		type: "string",
		pattern: "^[^\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\uD800-\\uDFFF\\uFFFE\\uFFFF]*$",
	},
	someText: {
		description: "Text with something in it other than spaces, tabs and line breaks.",
		...text,
		type: "string",
		pattern: "[^ \\t\\n\\r]",
	},
	technology: {
		description:
			"The slug of the product, language or protocol it's built with: lowercase words joined by hyphens, such as `postgres` or `grpc`. Any slug is valid. One without a logo is drawn as its name.",
		type: "string",
		pattern: formats.slug,
	},
	row: {
		description:
			"A name and a value shown on a Node, such as `replicas: 3`. Every Row has a Port on each side of its Node.",
		type: "object",
		properties: {
			name: {
				description: "The Row's name, drawn on the left. An Edge end names a Row by it.",
				...text,
			},
			value: {
				description:
					'The Row\'s value, drawn on the right. A number is written as a string, such as `"3"`.',
				...text,
			},
		},
		required: ["name"],
		additionalProperties: false,
	},
	end: {
		description:
			"An Edge end: the id of a Node, whose header Port the Edge uses, or one of the Node's Rows, whose Port on the matching side it uses instead.",
		oneOf: [id, { $ref: "#/$defs/rowEnd" }],
	},
	rowEnd: {
		description: "An Edge end at one of a Node's Rows.",
		type: "object",
		properties: {
			node: { description: "The Node's id.", ...id },
			row: { description: "The Row's name.", ...text },
		},
		required: ["node", "row"],
		additionalProperties: false,
	},
	link: {
		description:
			'A "see also" pointer from a Node or a Group to exactly one thing: another id, or a Markdown document.',
		oneOf: [{ $ref: "#/$defs/idLink" }, { $ref: "#/$defs/docLink" }],
	},
	idLink: {
		description: "A Link to another id in the Atlas.",
		type: "object",
		properties: {
			id: { description: "The id it leads to, which some Diagram in the Atlas draws.", ...id },
			label: { description: "Replaces the text shown for the Link.", ...text },
		},
		required: ["id"],
		additionalProperties: false,
	},
	docLink: {
		description:
			"A Link to a Markdown document, such as an ADR or a spec, and optionally to one of its sections.",
		type: "object",
		properties: {
			doc: {
				description:
					"The document's path from the repo root, such as `docs/adr/0001-clean-room.md`.",
				...text,
			},
			section: { description: "A heading in the document, by its text or by its anchor.", ...text },
			label: { description: "Replaces the text shown for the Link.", ...text },
		},
		required: ["doc"],
		additionalProperties: false,
	},
};

/**
 * The fields that a Notation's Nodes, Groups or Edges may have, of every
 * field that the model has for them: each with its schema, in the model's
 * order. The type checker makes `all` name every field of the model's type.
 */
function fieldsOf<T>(
	notation: Notation,
	thing: "node" | "group" | "edge",
	all: Record<keyof T, Schema>,
): Record<string, Schema> {
	return Object.fromEntries(
		Object.entries<Schema>(all).filter(([field]) => hasField(notation, thing, field)),
	);
}

/** What the schema holds for one Notation, under its name. */
function notationSchema(notation: Notation): NotationSchema {
	const { name } = notation;
	const of = (thing: string) => ({ $ref: `#/$defs/${name}/$defs/${thing}` });
	const node = fieldsOf<AnyNode>(notation, "node", {
		id: {
			description:
				"The Node's id, which names one thing across the Atlas: it has one Kind and one title on every Diagram.",
			...id,
		},
		kind: {
			description: "The Node's Kind, which alone decides how it looks.",
			enum: nodeKindsOf(notation),
		},
		title: {
			description:
				"The Node's title, drawn in its header. A title too wide for its Kind is shortened.",
			...text,
		},
		technology: { description: "What the Node is built with, drawn in its header.", ...technology },
		external: {
			description:
				"Whether the Node stands for something we don't own or run, drawn with a dashed outline.",
			type: "boolean",
		},
		status: {
			description: "How the Node is doing, shown as a mark at the end of its header.",
			enum: statusesOf(notation),
		},
		rows: {
			description: "The Node's Rows, drawn below its header, one band each, in order.",
			type: "array",
			items: { $ref: "#/$defs/row" },
		},
		description: {
			description: "What the Node is, which isn't drawn. The SVG carries it in its model.",
			...text,
		},
		links,
		callout: {
			description:
				"A short tag above the Node that draws attention to it, such as `single point of failure`.",
			...someText,
		},
	});
	const group = fieldsOf<AnyGroup>(notation, "group", {
		id: {
			description:
				"The Group's id, which names one thing across the Atlas: it has one Kind and one title on every Diagram.",
			...id,
		},
		kind: {
			description: "The Group's Kind, which alone decides how it looks.",
			enum: groupKindsOf(notation),
		},
		title: { description: "The Group's title, drawn in its label band.", ...text },
		members: {
			description: "The ids of the Group's Nodes and child Groups, in declaration order.",
			type: "array",
			items: id,
		},
		description: { description: "What the Group is, which isn't drawn.", ...text },
		links,
	});
	const edge = fieldsOf<AnyEdge>(notation, "edge", {
		id: {
			description:
				"An id, or the Edge's default name: its two Nodes' ids joined by `->`, as in `checkout-api->payments-api`.",
			type: "string",
			pattern: formats.edgeId,
		},
		kind: {
			description: "The Edge's Kind, which alone decides how it looks.",
			enum: edgeKindsOf(notation),
		},
		from: { description: "Where the Edge leaves from.", $ref: "#/$defs/end" },
		to: { description: "Where the Edge enters.", $ref: "#/$defs/end" },
		label: {
			description: "What passes over the Edge, drawn beside it, such as `Places orders`.",
			...someText,
		},
		technology: { description: "How it travels, drawn below the label.", ...technology },
		rate: {
			description:
				"How much passes over it, drawn below the label: a number, an optional `k` or `M`, a slash, and `s`, `min` or `h`, as in `2k/s` or `30/min`.",
			type: "string",
			pattern: formats.rate,
		},
	});
	const closed = (
		description: string,
		properties: Record<string, Schema>,
		required: string[],
	): ObjectSchema => ({
		description,
		type: "object",
		properties,
		required,
		additionalProperties: false,
	});
	return {
		description: `What a Diagram of the ${name} Notation holds: Nodes, Groups and Edges of the Kinds that the Notation has, each with the fields that its Diagrams may have.`,
		type: "object",
		properties: {
			nodes: { type: "array", items: of("node") },
			groups: { type: "array", items: of("group") },
			edges: { type: "array", items: of("edge") },
		},
		$defs: {
			node: closed(`One thing drawn on a Diagram of the ${name} Notation.`, node, [
				"id",
				"kind",
				"title",
			]),
			group: closed(
				`A labeled box drawn around Nodes and other Groups, on a Diagram of the ${name} Notation.`,
				group,
				["id", "kind", "title", "members"],
			),
			edge: closed(
				`A connection from one Port to another, on a Diagram of the ${name} Notation.`,
				edge,
				["id", "kind", "from", "to"],
			),
		},
	};
}

/**
 * The JSON Schema, draft 2020-12, of a Diagram in any of the Notations. It
 * checks what every Diagram shares, and then each Diagram's Nodes, Groups
 * and Edges against its own Notation's Kinds, statuses and fields.
 */
export function schemaOf<const Notations extends readonly Notation[]>(
	notations: Notations,
): DiagramSchema<Notations[number]["name"]> {
	const own = Object.fromEntries(
		notations.map((notation) => {
			if (Object.hasOwn(shared, notation.name)) {
				throw new Error(
					`A Notation can't be named \`${notation.name}\`: the schema has a definition of that name.`,
				);
			}
			return [notation.name, notationSchema(notation)];
		}),
	) as Record<Notations[number]["name"], NotationSchema>;
	return {
		$schema: "https://json-schema.org/draft/2020-12/schema",
		title: "Diagram",
		description,
		type: "object",
		properties: {
			version: {
				description: "The version of the JSON model. This engine reads version 1.",
				const: 1,
			},
			notation: {
				description:
					"The Notation the Diagram is written in, which decides the Kinds, statuses and fields that its Nodes, Groups and Edges may have.",
				enum: notations.map(({ name }) => name),
			},
			id: {
				description:
					"The path of the Diagram's module from the repo root, minus `.diagram.ts`, such as `docs/shop`. The Atlas sets it, so a generated Diagram can leave it out.",
				...text,
			},
			title: { description: "The Diagram's title.", ...text },
			description: {
				description: "What the Diagram shows, which isn't drawn. The SVG carries it in its model.",
				...text,
			},
			direction: {
				description: "Which way the ranks run: `right`, the default, or `down`.",
				enum: ["right", "down"],
				default: "right",
			},
			members: {
				description:
					"The ids of the Diagram's top-level Nodes and Groups, in declaration order, which breaks layout ties.",
				type: "array",
				items: id,
			},
			nodes: { description: "Every Node on the Diagram, whatever its Group.", type: "array" },
			groups: { description: "Every Group on the Diagram, whatever its parent.", type: "array" },
			edges: { description: "Every Edge on the Diagram.", type: "array" },
			walkthroughs: {
				description:
					"The Diagram's Walkthroughs. This engine doesn't play them yet, so the list must be empty.",
				type: "array",
				maxItems: 0,
			},
		},
		required: [
			"version",
			"notation",
			"title",
			"members",
			"nodes",
			"groups",
			"edges",
			"walkthroughs",
		],
		additionalProperties: false,
		// Each Diagram is checked against the Notation it names, and no other.
		allOf: notations.map(({ name }) => ({
			if: { properties: { notation: { const: name } }, required: ["notation"] },
			// biome-ignore lint/suspicious/noThenProperty: `then` is JSON Schema's keyword.
			then: { $ref: `#/$defs/${name}` },
		})),
		$defs: { ...shared, ...own },
	};
}
