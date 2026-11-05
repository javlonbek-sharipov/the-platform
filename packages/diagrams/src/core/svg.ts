/**
 * The SVG writer turns a scene into one self-contained SVG: its Groups, its
 * Edges with their marks and labels, and its Nodes, with what the SVG says
 * about itself, and a style, which embeds the bundled font's glyphs that it
 * draws and the theme's rules for the colors it uses (`style.ts`). The path
 * data along Edges comes from `edge-paths.ts`, and the XML from `xml.ts`.
 *
 * Its output is deterministic: elements are written in model order and
 * attributes in a fixed order, numbers have at most two decimals and never
 * show a negative zero, and lines end with LF, as does the file.
 */

import type { AnyDiagram } from "../authoring/model.ts";
import {
	definitionOf,
	type EdgeKindDefinition,
	type GroupKindDefinition,
	type Notation,
	type StatusDefinition,
} from "../notations/notation.ts";
import { compareText } from "./bundles.ts";
import { descriptionOf } from "./description.ts";
import { arrowhead, arrowOutline, chevronPath, globePath, linePath } from "./edge-paths.ts";
import { hash } from "./encoding.ts";
import { markSizes } from "./marks.ts";
import { outlines, type PathData } from "./outlines.ts";
import type {
	Point,
	Scene,
	SceneEdge,
	SceneGroup,
	SceneJunction,
	SceneLabel,
	SceneLogo,
	SceneNode,
	SceneStatus,
	SceneText,
} from "./scene.ts";
import { colorUses, embeddedFonts, fontWeights, styleElement, themeRules } from "./style.ts";
import { logoUnits, technologyOf } from "./technology.ts";
import { collapseSpaces, type FontData, rowTextsOf } from "./text.ts";
import { type Attribute, attributesText, element, empty, indent, number, start } from "./xml.ts";

/** How opaque the hue is in the solid parts of an outline, such as a window's title bar. */
const solidOpacity = 0.5;
const badgeStroke = 1.5;
/** How much wider a callout makes its Node's outline. */
const highlightGain = 1;
/** The dashes of a dashed line, an Edge's or a Group's border: 6 px drawn, then 4 px left out. */
const dashes = "6 4";

/** Writes a Diagram's scene as an SVG, with each Kind's look from the Diagram's Notation. */
export function writeSvg(
	diagram: AnyDiagram,
	notation: Notation,
	scene: Scene,
	fontData?: FontData,
): string {
	const { bounds } = scene;
	// Labels are drawn over every Edge, so that no route runs across one.
	const labels = scene.edges.flatMap(({ id, label }): [string, SceneLabel][] =>
		label === undefined ? [] : [[id, label]],
	);
	const size: Attribute[] = [
		["viewBox", [bounds.x, bounds.y, bounds.width, bounds.height].map(number).join(" ")],
		["width", bounds.width],
		["height", bounds.height],
	];
	// What the SVG says about itself: to screen readers, and to the web
	// component, which needs nothing but the SVG. No style reaches any of it,
	// so it stays out of the scope's name, and editing it changes only these lines.
	const about = [
		indent(1, element("title", [], collapseSpaces(diagram.title))),
		indent(1, element("desc", [], descriptionOf(diagram, notation, scene))),
		indent(1, element("metadata", [], modelText(diagram))),
	];
	const body = [
		indent(
			1,
			empty("rect", [
				["class", "diagram-background"],
				["x", bounds.x],
				["y", bounds.y],
				["width", bounds.width],
				["height", bounds.height],
			]),
		),
		...(scene.groups.length === 0
			? []
			: [
					indent(1, start("g", [["class", "diagram-groups"]])),
					...scene.groups.flatMap((group) =>
						writeGroup(group, definitionOf(notation.groupKinds, group.kind)).map((text) =>
							indent(2, text),
						),
					),
					indent(1, "</g>"),
				]),
		indent(
			1,
			start("g", [
				["class", "diagram-edges"],
				["fill", "none"],
			]),
		),
		// Edges that cross between Groups go beneath the others, so a trunk they
		// share with Edges that don't shows the plain color.
		...[
			...scene.edges.filter((edge) => edge.crosses !== undefined),
			...scene.edges.filter((edge) => edge.crosses === undefined),
		].flatMap((edge) =>
			writeEdge(edge, definitionOf(notation.edgeKinds, edge.kind)).map((text) => indent(2, text)),
		),
		...(scene.junctions.length === 0
			? []
			: [
					indent(2, start("g", [["class", "diagram-junctions"]])),
					...scene.junctions.map((junction) => indent(3, writeJunction(junction))),
					indent(2, "</g>"),
				]),
		indent(1, "</g>"),
		...(labels.length === 0
			? []
			: [
					indent(1, start("g", [["class", "diagram-labels"]])),
					...labels.flatMap(([id, label]) => writeLabel(id, label).map((text) => indent(2, text))),
					indent(1, "</g>"),
				]),
		indent(1, start("g", [["class", "diagram-nodes"]])),
		...scene.nodes.flatMap((node) => writeNode(node, notation).map((text) => indent(2, text))),
		indent(1, "</g>"),
	];
	const fonts = fontData === undefined ? [] : embeddedFonts(scene, fontData);
	const uses = colorUses(body, notation);
	// Inlined into a page, an SVG's style applies to the whole page, so the font's
	// family and every selector carry a name made from everything else in the SVG.
	const contents = [
		attributesText(size),
		...fonts.map((font) => font.data),
		...themeRules("", uses),
		...body,
	];
	const scope = `diagram-${hash(contents.join("\n"))}`;
	const lines = [
		start("svg", [
			["xmlns", "http://www.w3.org/2000/svg"],
			["class", scope],
			["role", "img"],
			...size,
		]),
		...about,
		...styleElement(scope, fonts, uses).map((text) => indent(1, text)),
		...body,
		"</svg>",
	];
	return `${lines.join("\n")}\n`;
}

/** A Group's box, drawn as its Kind draws it, with its title in its label band. */
function writeGroup(group: SceneGroup, look: GroupKindDefinition): string[] {
	const { box, title } = group;
	return [
		start("g", [
			["data-group", group.id],
			["data-kind", group.kind],
		]),
		indent(
			1,
			empty("rect", [
				["class", "diagram-group"],
				["x", box.x],
				["y", box.y],
				["width", box.width],
				["height", box.height],
				["rx", 8],
				["fill", "none"],
				["stroke-width", look.stroke],
				...(look.line === "dashed" ? [["stroke-dasharray", dashes] as const] : []),
			]),
		),
		indent(1, writeText(title, "diagram-group-title")),
		"</g>",
	];
}

/**
 * A Node: its Kind's outline, each shape of it filled with the surface, then
 * tinted and stroked in the Kind's hue; its badge, its Technology's logo, its
 * title and its Technology's name; a line across it above its Rows, and their
 * names and values; its status mark; and its callout's tag.
 */
function writeNode(node: SceneNode, notation: Notation): string[] {
	const { box, badge, title, technology, logo, rows, callout } = node;
	const look = definitionOf(notation.nodeKinds, node.kind);
	const outline = outlines[look.outline];
	// A callout highlights the outline: wider, and in the accent color.
	const width = callout === undefined ? outline.stroke : outline.stroke + highlightGain;
	const { shapes, solids, details } = outline.draw(box, width, node.header);
	// A line across the Node, from one side of its face to the other, sets its
	// Rows apart from its header.
	const divider = rows[0]?.box.y;
	const face = {
		left: box.x + width / 2 + outline.inset.left,
		right: box.x + box.width - width / 2 - outline.inset.right,
	};
	// An External Node's outline is dashed, in a rhythm that grows with its stroke.
	const stroke = (width: number): Attribute[] => [
		["stroke", "currentColor"],
		["stroke-width", width],
		...(node.external
			? [["stroke-dasharray", `${number(4 * width)} ${number(2.5 * width)}`] as const]
			: []),
	];
	const parts = [
		...shapes.flatMap((shape, index) => [
			empty("path", [
				["class", "diagram-base"],
				["d", pathText(shape)],
			]),
			// Solid parts lie under the last shape's stroke, so that it runs unbroken.
			...(index < shapes.length - 1
				? []
				: solids.map((solid) =>
						empty("path", [
							["d", pathText(solid)],
							["fill", "currentColor"],
							["fill-opacity", solidOpacity],
						]),
					)),
			empty("path", [
				...(callout === undefined ? [] : [["class", "diagram-highlight"] as const]),
				["d", pathText(shape)],
				["fill", "currentColor"],
				["fill-opacity", outline.tint],
				...stroke(width),
				["stroke-linejoin", "round"],
			]),
		]),
		...details.map((detail) =>
			empty("path", [["d", pathText(detail)], ["fill", "none"], ...stroke(outline.detail)]),
		),
		empty("path", [
			["transform", `translate(${number(badge.x)} ${number(badge.y)})`],
			["d", look.badge],
			["fill", "none"],
			["stroke", "currentColor"],
			["stroke-width", badgeStroke],
			["stroke-linecap", "round"],
			["stroke-linejoin", "round"],
		]),
		...(logo === undefined ? [] : writeLogo(logo)),
		writeText(title, "diagram-text"),
		...(technology === undefined ? [] : [writeText(technology, "diagram-technology")]),
		...(divider === undefined
			? []
			: [
					empty("line", [
						["x1", face.left],
						["y1", divider],
						["x2", face.right],
						["y2", divider],
						...stroke(outline.detail),
					]),
				]),
		...rowTextsOf(node).map((text) => writeText(text, "diagram-text")),
		...(node.status === undefined
			? []
			: [writeStatus(node.status, definitionOf(notation.statuses, node.status.value))]),
		...(callout === undefined
			? []
			: [
					empty("rect", [
						["class", "diagram-tag"],
						["x", callout.tag.x],
						["y", callout.tag.y],
						["width", callout.tag.width],
						["height", callout.tag.height],
						["rx", callout.tag.height / 2],
					]),
					writeText(callout.text, "diagram-tag-text"),
				]),
	];
	return [
		start("g", [
			["data-node", node.id],
			["data-kind", node.kind],
		]),
		...parts.map((text) => indent(1, text)),
		"</g>",
	];
}

/**
 * A Technology's logo: its path data from the logo table, in a viewport of
 * its own that scales the logo's square to the logo's box, exactly.
 */
function writeLogo({ technology, box }: SceneLogo): string[] {
	const path = technologyOf(technology).logo;
	if (path === undefined) {
		throw new Error(`Technology ${technology} has no logo, so the scene should draw none`);
	}
	return [
		start("svg", [
			["class", "diagram-logo"],
			["x", box.x],
			["y", box.y],
			["width", box.width],
			["height", box.height],
			["viewBox", `0 0 ${logoUnits} ${logoUnits}`],
		]),
		indent(1, empty("path", [["d", path]])),
		"</svg>",
	];
}

/**
 * A text, centered on its point. It sets its own anchor and baseline rather
 * than inheriting them from a group: SVG 1.1 doesn't inherit
 * `dominant-baseline`, so renderers that follow it, such as resvg, would set
 * the text on its alphabetic baseline instead, 5 px high.
 */
function writeText(text: SceneText, className: string): string {
	return element(
		"text",
		[
			["class", className],
			["x", text.point.x],
			["y", text.point.y],
			["font-size", text.size],
			["font-weight", fontWeights[text.weight]],
			["text-anchor", "middle"],
			["dominant-baseline", "central"],
		],
		text.text,
	);
}

function writeStatus({ value, mark }: SceneStatus, look: StatusDefinition): string {
	const paint: Attribute[] = look.line
		? [
				["fill", "none"],
				["stroke", "currentColor"],
				["stroke-width", 2.5],
				["stroke-linecap", "round"],
			]
		: [
				["fill", "currentColor"],
				["stroke", "currentColor"],
				["stroke-width", 1],
				["stroke-linejoin", "round"],
			];
	return empty("path", [
		["class", `diagram-status-${value}`],
		["transform", `translate(${number(mark.x)} ${number(mark.y)})`],
		["d", look.mark],
		...paint,
	]);
}

/**
 * The JSON model, on one line, with every object's fields in code unit order,
 * so that equal models give the same text however they were built.
 */
function modelText(diagram: AnyDiagram): string {
	return JSON.stringify(diagram, (_, value: unknown) =>
		typeof value === "object" && value !== null && !Array.isArray(value)
			? Object.fromEntries(
					Object.keys(value)
						.sort(compareText)
						.map((key) => [key, (value as Record<string, unknown>)[key]]),
				)
			: value,
	);
}

/** Path data, with its numbers written as every number in the SVG is. */
function pathText(path: PathData): string {
	return path.map((part) => (typeof part === "number" ? number(part) : part)).join(" ");
}

/** An Edge's line: a body, in the Edge's color, inside a wider, darker casing. */
const bodyWidth = 1.5;
const casingWidth = markSizes.casing;

/**
 * An Edge: its line, as a casing beneath a body; its chevrons, cased alike;
 * its arrowhead, unless its Kind is symmetric; and its badge, if it crosses
 * between Groups.
 */
function writeEdge(edge: SceneEdge, look: EdgeKindDefinition): string[] {
	const directed = look.symmetric !== true;
	const line = linePath(edge, directed);
	const dashed: Attribute[] = look.line === "dashed" ? [["stroke-dasharray", dashes]] : [];
	const rounded: Attribute[] = [
		["stroke-linecap", "round"],
		["stroke-linejoin", "round"],
	];
	const parts = [
		...cased(line, dashed),
		...(edge.chevrons.length === 0 ? [] : cased(edge.chevrons.map(chevronPath).join(" "), rounded)),
		...(directed
			? [
					empty("path", [
						["class", "diagram-casing"],
						["d", arrowhead(edge.toPort)],
						["fill", "currentColor"],
						["stroke-width", arrowOutline],
						["stroke-linejoin", "round"],
					]),
				]
			: []),
		...(edge.crosses === undefined ? [] : writeBadge(edge.crosses.badge)),
	];
	return [
		start("g", [
			["data-edge", edge.id],
			["data-kind", edge.kind],
			["data-from", edge.from],
			...(edge.fromRow === undefined ? [] : [["data-from-row", edge.fromRow] as const]),
			["data-to", edge.to],
			...(edge.toRow === undefined ? [] : [["data-to-row", edge.toRow] as const]),
			...(edge.crosses === undefined ? [] : [["data-crosses", edge.crosses.kind] as const]),
		]),
		...parts.map((text) => indent(1, text)),
		"</g>",
	];
}

/** The radius of the dot between a label's Technology and its rate. */
const separatorRadius = 1.25;

/**
 * An Edge's label: a box in the background's color, which hides whatever
 * passes behind it, its text, and its Technology and rate below it, muted,
 * with a dot between them, and the Technology's logo before its name.
 */
function writeLabel(id: string, label: SceneLabel): string[] {
	const { box, text, technology, logo, rate } = label;
	return [
		start("g", [["data-edge-label", id]]),
		indent(
			1,
			empty("rect", [
				["class", "diagram-label"],
				["x", box.x],
				["y", box.y],
				["width", box.width],
				["height", box.height],
				["rx", 4],
			]),
		),
		...(text === undefined ? [] : [indent(1, writeText(text, "diagram-label-text"))]),
		...(logo === undefined ? [] : writeLogo(logo).map((line) => indent(1, line))),
		...(technology === undefined ? [] : [indent(1, writeText(technology, "diagram-label-detail"))]),
		...(technology === undefined || rate === undefined
			? []
			: [
					indent(
						1,
						empty("circle", [
							["class", "diagram-label-detail"],
							[
								"cx",
								(technology.point.x + technology.width / 2 + rate.point.x - rate.width / 2) / 2,
							],
							["cy", rate.point.y],
							["r", separatorRadius],
						]),
					),
				]),
		...(rate === undefined ? [] : [indent(1, writeText(rate, "diagram-label-detail"))]),
		"</g>",
	];
}

/** A path stroked as an Edge's line is: a casing, then a body in the Edge's color over it. */
function cased(d: string, attributes: Attribute[]): string[] {
	return [
		empty("path", [
			["class", "diagram-casing"],
			["d", d],
			["stroke-width", casingWidth],
			...attributes,
		]),
		empty("path", [
			["d", d],
			["stroke", "currentColor"],
			["stroke-width", bodyWidth],
			...attributes,
		]),
	];
}

/** The badge of an Edge that crosses between Groups: a disc in its color, with a globe on it. */
const globeStroke = 1;

/** A badge, centered on its point: a disc, cased like the Edge, with a globe on it. */
function writeBadge({ x, y }: Point): string[] {
	return [
		empty("circle", [
			["class", "diagram-casing"],
			["cx", x],
			["cy", y],
			["r", markSizes.badge.radius],
			["fill", "currentColor"],
			["stroke-width", markSizes.badge.outline],
		]),
		empty("path", [
			["class", "diagram-badge"],
			["d", globePath({ x, y })],
			["stroke-width", globeStroke],
		]),
	];
}

/** A junction's mark: a dot in the Edges' color, cased like them. */
const junctionRadius = 3;
const junctionOutline = 1.5;

/**
 * The mark over a junction, where the Edges from one Port part. It carries
 * the Port, as the Edges' groups carry their sources.
 */
function writeJunction(junction: SceneJunction): string {
	return empty("circle", [
		["class", "diagram-casing"],
		["data-from", junction.node],
		...(junction.row === undefined ? [] : [["data-from-row", junction.row] as const]),
		["cx", junction.point.x],
		["cy", junction.point.y],
		["r", junctionRadius],
		["fill", "currentColor"],
		["stroke-width", junctionOutline],
	]);
}
