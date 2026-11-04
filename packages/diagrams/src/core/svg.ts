/**
 * The SVG writer turns a scene into one self-contained SVG. It works out which
 * of the bundled font's glyphs the SVG draws, and embeds the font data that
 * its caller's function gives for them.
 *
 * Its output is deterministic: elements are written in model order and
 * attributes in a fixed order, numbers have at most two decimals and never
 * show a negative zero, and lines end with LF, as does the file.
 */

import type { Diagram } from "../authoring/model.ts";
import {
	type ArchitectureEdgeLook,
	type ArchitectureNodeLook,
	type ArchitectureStatus,
	architectureEdgeLooks,
	architectureFamilies,
	architectureNodeKinds,
	architectureNodeLooks,
	architectureStatuses,
	logoUnits,
	technologyOf,
} from "../notations/architecture.ts";
import { compareText } from "./bundles.ts";
import { descriptionOf } from "./description.ts";
import { outlines, type PathData } from "./outlines.ts";
import type {
	Point,
	RoutePoint,
	Scene,
	SceneChevron,
	SceneEdge,
	SceneGroup,
	SceneJunction,
	SceneLabel,
	SceneLogo,
	SceneNode,
	ScenePort,
	SceneText,
} from "./scene.ts";
import { collapseSpaces, type FontData, type FontWeight, hasCharacter } from "./text.ts";
import { type ColorName, palette } from "./theme.ts";

type Attribute = readonly [name: string, value: string | number];

/**
 * One place the SVG uses a color: the elements a selector picks, inside the
 * SVG, and which of their properties takes the color.
 */
interface ColorUse {
	selector: string;
	property: "fill" | "stroke" | "color";
	color: ColorName;
}
/**
 * Where the embedded font can't be used, text falls back to fonts no wider
 * than Inter, so that text shortened to fit still fits. There's no generic
 * family at the end, since that could be a wider font.
 */
const fallbackFonts = "Helvetica, Arial";
const fontWeights: Record<FontWeight, number> = { regular: 400, semibold: 600 };
/** How opaque the hue is in the solid parts of an outline, such as a window's title bar. */
const solidOpacity = 0.5;
const badgeStroke = 1.5;
/** How much wider a callout makes its Node's outline. */
const highlightGain = 1;

/**
 * Each status's mark, drawn in a box 12 px square: a shape of its own, in a
 * color of its own, so that color is never the only signal.
 */
const statusMarks: Record<ArchitectureStatus, { path: string; color: ColorName; line: boolean }> = {
	// A dot.
	ok: { path: "M 1 6 A 5 5 0 1 0 11 6 A 5 5 0 1 0 1 6 Z", color: "ok", line: false },
	// A warning triangle.
	degraded: { path: "M 6 1.5 L 11 10.5 H 1 Z", color: "warn", line: false },
	// A cross.
	down: { path: "M 2.5 2.5 L 9.5 9.5 M 9.5 2.5 L 2.5 9.5", color: "danger", line: true },
	// A square.
	unknown: { path: "M 1.75 1.75 H 10.25 V 10.25 H 1.75 Z", color: "muted", line: false },
};

export function writeSvg(diagram: Diagram, scene: Scene, fontData?: FontData): string {
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
		indent(1, element("desc", [], descriptionOf(diagram, scene))),
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
					...scene.groups.flatMap((group) => writeGroup(group).map((text) => indent(2, text))),
					indent(1, "</g>"),
				]),
		indent(
			1,
			start("g", [
				["class", "diagram-edges"],
				["fill", "none"],
			]),
		),
		// Edges that cross between regions or zones go beneath the others, so a
		// trunk they share with Edges that don't shows the plain color.
		...[
			...scene.edges.filter((edge) => edge.crosses !== undefined),
			...scene.edges.filter((edge) => edge.crosses === undefined),
		].flatMap((edge) => writeEdge(edge).map((text) => indent(2, text))),
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
		...scene.nodes.flatMap((node) => writeNode(node).map((text) => indent(2, text))),
		indent(1, "</g>"),
	];
	const fonts = fontData === undefined ? [] : embeddedFonts(scene, fontData);
	const uses = colorUses(scene);
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
		...style(scope, fonts, uses).map((text) => indent(1, text)),
		...body,
		"</svg>",
	];
	return `${lines.join("\n")}\n`;
}

interface EmbeddedFont {
	weight: FontWeight;
	/** The font data, in base64. */
	data: string;
}

/** The font data for each weight that the scene draws text in, in a fixed order. */
function embeddedFonts(scene: Scene, fontData: FontData): EmbeddedFont[] {
	// Every piece of text the scene draws.
	const texts = [
		...scene.nodes.flatMap(textsOf),
		...scene.groups.map((group) => group.title),
		...scene.edges.flatMap(({ label }) => (label === undefined ? [] : labelTextsOf(label))),
	];
	return (["regular", "semibold"] as const).flatMap((weight) => {
		const drawn = new Set(
			texts.filter((text) => text.weight === weight).flatMap((text) => [...text.text]),
		);
		const characters = [...drawn]
			.filter((character) => hasCharacter(character, weight))
			.sort((a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0))
			.join("");
		return characters === "" ? [] : [{ weight, data: base64(fontData({ weight, characters })) }];
	});
}

/**
 * The embedded font's faces; one rule for the SVG's root, which every text
 * inherits from, and which turns kerning and ligatures off, since measuring
 * ignores them; and the theme's rules.
 */
function style(scope: string, fonts: EmbeddedFont[], uses: ColorUse[]): string[] {
	return [
		"<style>",
		...fonts.map((font) =>
			indent(
				1,
				`@font-face { font-family: "${scope}"; font-weight: ${fontWeights[font.weight]}; src: url("data:font/ttf;base64,${font.data}") format("truetype"); }`,
			),
		),
		indent(
			1,
			`.${scope} { font-family: "${scope}", ${fallbackFonts}; font-kerning: none; font-variant-ligatures: none; }`,
		),
		...themeRules(scope, uses).map((text) => indent(1, text)),
		"</style>",
	];
}

/**
 * The colors the scene's drawing uses, in a fixed order. Each Node takes its
 * Kind's hue as its `color`, which the parts of its outline and its badge use.
 */
function colorUses(scene: Scene): ColorUse[] {
	const kinds = new Set(scene.nodes.map((node) => node.kind));
	const labels = scene.edges.flatMap(({ label }) => (label === undefined ? [] : [label]));
	const hues = architectureFamilies.flatMap((family): ColorUse[] => {
		const members = architectureNodeKinds.filter(
			(kind) => kinds.has(kind) && architectureNodeLooks[kind].family === family,
		);
		return members.length === 0
			? []
			: [
					{
						selector: members.map((kind) => `[data-node][data-kind="${kind}"]`).join(", "),
						property: "color",
						color: `hue-${family}`,
					},
				];
	});
	return [
		{ selector: ".diagram-background", property: "fill", color: "background" },
		...(scene.groups.length === 0
			? []
			: ([
					{ selector: ".diagram-group", property: "stroke", color: "border" },
					{ selector: ".diagram-group-title", property: "fill", color: "muted" },
				] as const)),
		...(scene.edges.length === 0
			? []
			: ([
					{ selector: ".diagram-edges", property: "color", color: "edge" },
					{ selector: ".diagram-casing", property: "stroke", color: "edge-casing" },
				] as const)),
		...(scene.edges.every((edge) => edge.crosses === undefined)
			? []
			: ([
					{ selector: "[data-crosses]", property: "color", color: "warn" },
					{ selector: "[data-crosses] .diagram-casing", property: "stroke", color: "warn-casing" },
					{ selector: ".diagram-badge", property: "stroke", color: "surface" },
				] as const)),
		...(labels.length === 0
			? []
			: [{ selector: ".diagram-label", property: "fill", color: "background" } as const]),
		...(labels.some(({ text }) => text !== undefined)
			? [{ selector: ".diagram-label-text", property: "fill", color: "ink" } as const]
			: []),
		...(labels.some(({ technology, rate }) => technology !== undefined || rate !== undefined)
			? [{ selector: ".diagram-label-detail", property: "fill", color: "muted" } as const]
			: []),
		...(scene.nodes.length === 0
			? []
			: [{ selector: ".diagram-base", property: "fill", color: "surface" } as const]),
		...hues,
		...architectureStatuses
			.filter((status) => scene.nodes.some((node) => node.status?.value === status))
			.map(
				(status): ColorUse => ({
					selector: `.diagram-status-${status}`,
					property: "color",
					color: statusMarks[status].color,
				}),
			),
		...(scene.nodes.length === 0
			? []
			: [{ selector: ".diagram-text", property: "fill", color: "ink" } as const]),
		...(scene.nodes.every((node) => node.technology === undefined)
			? []
			: [{ selector: ".diagram-technology", property: "fill", color: "muted" } as const]),
		// Every logo is drawn in one color of the theme, never in its brand's.
		...(scene.nodes.every((node) => node.logo === undefined) &&
		labels.every((label) => label.logo === undefined)
			? []
			: [{ selector: ".diagram-logo", property: "fill", color: "muted" } as const]),
		...(scene.nodes.every((node) => node.callout === undefined)
			? []
			: ([
					{ selector: ".diagram-highlight", property: "stroke", color: "accent" },
					{ selector: ".diagram-tag", property: "fill", color: "accent" },
					{ selector: ".diagram-tag-text", property: "fill", color: "surface" },
				] as const)),
	];
}

/**
 * One rule for each use of a color, with its light fallback, then the same
 * rules again with dark fallbacks, for viewers who prefer a dark scheme. Each
 * selector is scoped to the SVG.
 */
function themeRules(scope: string, uses: ColorUse[]): string[] {
	const rule = (use: ColorUse, theme: "light" | "dark") => {
		const selectors = use.selector
			.split(", ")
			.map((selector) => `.${scope} ${selector}`)
			.join(", ");
		return `${selectors} { ${use.property}: var(--diagram-${use.color}, ${palette[use.color][theme]}); }`;
	};
	return [
		...uses.map((use) => rule(use, "light")),
		"@media (prefers-color-scheme: dark) {",
		...uses.map((use) => indent(1, rule(use, "dark"))),
		"}",
	];
}

/** Every piece of text a Node draws, in the order it draws them. */
function textsOf(node: SceneNode): SceneText[] {
	return [
		node.title,
		...(node.technology === undefined ? [] : [node.technology]),
		...rowTextsOf(node),
		...(node.callout === undefined ? [] : [node.callout.text]),
	];
}

/** Each Row's name, and its value if it has one, in order. */
function rowTextsOf(node: SceneNode): SceneText[] {
	return node.rows.flatMap((row) => (row.value === undefined ? [row.name] : [row.name, row.value]));
}

/**
 * How each Group Kind draws its box: a `system` heavier than a `region`, and a
 * `zone` dashed.
 */
const groupOutlines: Record<string, Attribute[]> = {
	system: [["stroke-width", 2]],
	region: [["stroke-width", 1.5]],
	zone: [
		["stroke-width", 1.5],
		["stroke-dasharray", "6 4"],
	],
};

/** A Group's box, drawn as its Kind draws it, with its title in its label band. */
function writeGroup(group: SceneGroup): string[] {
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
				...(groupOutlines[group.kind] ?? []),
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
function writeNode(node: SceneNode): string[] {
	const { box, badge, title, technology, logo, rows, callout } = node;
	const look = lookOf(node.kind);
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
		...(node.status === undefined ? [] : [writeStatus(node.status)]),
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

function writeStatus({ value, mark }: { value: string; mark: { x: number; y: number } }): string {
	const look = (statusMarks as Partial<Record<string, (typeof statusMarks)[ArchitectureStatus]>>)[
		value
	];
	if (look === undefined) {
		throw new Error(`Status ${value} has no mark, so validation should have rejected it`);
	}
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
		["d", look.path],
		...paint,
	]);
}

function lookOf(kind: string): ArchitectureNodeLook {
	const look = (architectureNodeLooks as Partial<Record<string, ArchitectureNodeLook>>)[kind];
	if (look === undefined) {
		throw new Error(`Node Kind ${kind} has no look, so validation should have rejected it`);
	}
	return look;
}

/**
 * The JSON model, on one line, with every object's fields in code unit order,
 * so that equal models give the same text however they were built.
 */
function modelText(diagram: Diagram): string {
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
const casingWidth = 3.5;
/** The dashes of a dashed line, such as a message's: 6 px drawn, then 4 px left out. */
const dashes = "6 4";
/**
 * The arrowhead at an Edge's target: how far it reaches back from its tip, and
 * half its width there. Its outline is the casing's, a pixel wide.
 */
const arrowLength = 8;
const arrowHalfWidth = 4.5;
const arrowOutline = 1;
/**
 * A chevron: how far it reaches along its run, its tip half of that ahead of
 * its point, and how far its arms reach to each side, past the casing.
 */
const chevronLength = 4;
const chevronHalfWidth = 3.5;

/**
 * An Edge: its line, as a casing beneath a body; its chevrons, cased alike;
 * its arrowhead; and its badge, if it crosses between regions or zones.
 */
function writeEdge(edge: SceneEdge): string[] {
	const line = linePath(edge);
	const dashed: Attribute[] =
		edgeLookOf(edge.kind).line === "dashed" ? [["stroke-dasharray", dashes]] : [];
	const rounded: Attribute[] = [
		["stroke-linecap", "round"],
		["stroke-linejoin", "round"],
	];
	const parts = [
		...cased(line, dashed),
		...(edge.chevrons.length === 0 ? [] : cased(edge.chevrons.map(chevronPath).join(" "), rounded)),
		empty("path", [
			["class", "diagram-casing"],
			["d", arrowhead(edge.toPort)],
			["fill", "currentColor"],
			["stroke-width", arrowOutline],
			["stroke-linejoin", "round"],
		]),
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

/** The texts of a label, in the order it draws them. */
function labelTextsOf({ text, technology, rate }: SceneLabel): SceneText[] {
	return [text, technology, rate].flatMap((each) => (each === undefined ? [] : [each]));
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

/**
 * The path data of an Edge's line: each piece of its stroke, between hops, as
 * a subpath of its own, so that hops show as gaps in both casing and body.
 * The piece at the target stops just inside the arrowhead, so that the
 * casing doesn't show beside the tip. The pieces are written from the target
 * back, so that the dashes of a dashed line start there: the Edges of one
 * bundle end at one Port, hop together, and so dash alike along the trunk
 * they share.
 */
function linePath({ route, stroke }: SceneEdge): string {
	const pieces = stroke.length === 0 ? [route] : stroke;
	return pieces
		.map((piece, index) =>
			index === pieces.length - 1 ? trimmed(piece, arrowLength - arrowOutline) : [...piece],
		)
		.reverse()
		.map((piece) => pathData(piece.reverse()))
		.join(" ");
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

function edgeLookOf(kind: string): ArchitectureEdgeLook {
	const look = (architectureEdgeLooks as Partial<Record<string, ArchitectureEdgeLook>>)[kind];
	if (look === undefined) {
		throw new Error(`Edge Kind ${kind} has no look, so validation should have rejected it`);
	}
	return look;
}

/** The badge of an Edge that crosses between regions or zones: a disc in its color. */
const badgeRadius = 7;
const badgeOutline = 1;
/** The globe on the badge: its radius, and the half-width of its meridian. */
const globeRadius = 3.5;
const meridian = 1.5;
const globeStroke = 1;

/** A badge, centered on its point: a disc, cased like the Edge, with a globe on it. */
function writeBadge({ x, y }: Point): string[] {
	const [left, right, top, bottom] = [
		x - globeRadius,
		x + globeRadius,
		y - globeRadius,
		y + globeRadius,
	];
	const r = number(globeRadius);
	const globe = [
		`M ${number(left)} ${number(y)} A ${r} ${r} 0 1 0 ${number(right)} ${number(y)}`,
		`A ${r} ${r} 0 1 0 ${number(left)} ${number(y)} Z`,
		`M ${number(x)} ${number(top)} A ${number(meridian)} ${r} 0 0 0 ${number(x)} ${number(bottom)}`,
		`A ${number(meridian)} ${r} 0 0 0 ${number(x)} ${number(top)} Z`,
		`M ${number(left)} ${number(y)} H ${number(right)}`,
	].join(" ");
	return [
		empty("circle", [
			["class", "diagram-casing"],
			["cx", x],
			["cy", y],
			["r", badgeRadius],
			["fill", "currentColor"],
			["stroke-width", badgeOutline],
		]),
		empty("path", [
			["class", "diagram-badge"],
			["d", globe],
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

/** A chevron's path data: its two arms, which meet at its tip. */
function chevronPath({ point, heading: way }: SceneChevron): string {
	const tip = {
		x: point.x + (way.x * chevronLength) / 2,
		y: point.y + (way.y * chevronLength) / 2,
	};
	const back = {
		x: point.x - (way.x * chevronLength) / 2,
		y: point.y - (way.y * chevronLength) / 2,
	};
	const across = { x: -way.y * chevronHalfWidth, y: way.x * chevronHalfWidth };
	return [
		`M ${number(back.x + across.x)} ${number(back.y + across.y)}`,
		`L ${number(tip.x)} ${number(tip.y)}`,
		`L ${number(back.x - across.x)} ${number(back.y - across.y)}`,
	].join(" ");
}

/**
 * The arrowhead at a Port: a triangle whose tip touches the Node's side, and
 * which points into the Node, along the Port's stub.
 */
function arrowhead({ point, stub }: ScenePort): string {
	const into = heading(stub, point);
	const base = { x: point.x - into.x * arrowLength, y: point.y - into.y * arrowLength };
	const across = { x: -into.y * arrowHalfWidth, y: into.x * arrowHalfWidth };
	return [
		`M ${number(point.x)} ${number(point.y)}`,
		`L ${number(base.x + across.x)} ${number(base.y + across.y)}`,
		`L ${number(base.x - across.x)} ${number(base.y - across.y)}`,
		"Z",
	].join(" ");
}

/**
 * A route with its target end moved back along its last run, by up to `by`,
 * but never into the arc of the corner before it.
 */
function trimmed(route: RoutePoint[], by: number): RoutePoint[] {
	const end = route.at(-1);
	const before = route.at(-2);
	if (end === undefined || before === undefined) {
		return [...route];
	}
	const room = Math.abs(end.x - before.x) + Math.abs(end.y - before.y) - before.radius;
	const cut = Math.max(0, Math.min(by, room));
	const back = heading(end, before);
	return [...route.slice(0, -1), { x: end.x + back.x * cut, y: end.y + back.y * cut, radius: 0 }];
}

/**
 * A route's path data: its runs as lines, and each rounded corner as an arc
 * from where the arc meets the run before it to where it meets the run after.
 */
function pathData(route: RoutePoint[]): string {
	const commands: string[] = [];
	let pen: Point | undefined;
	const lineTo = (point: Point) => {
		if (pen === undefined || pen.x !== point.x || pen.y !== point.y) {
			commands.push(`${pen === undefined ? "M" : "L"} ${number(point.x)} ${number(point.y)}`);
		}
		pen = point;
	};
	route.forEach((point, index) => {
		const before = route[index - 1];
		const after = route[index + 1];
		if (before === undefined || after === undefined || point.radius === 0) {
			lineTo(point);
			return;
		}
		const { radius } = point;
		const into = heading(before, point);
		const out = heading(point, after);
		lineTo({ x: point.x - into.x * radius, y: point.y - into.y * radius });
		const end = { x: point.x + out.x * radius, y: point.y + out.y * radius };
		// With y pointing down, a turn whose cross product is positive is clockwise
		// on screen, which is the direction of SVG's sweep flag 1.
		const sweep = into.x * out.y - into.y * out.x > 0 ? 1 : 0;
		commands.push(
			`A ${number(radius)} ${number(radius)} 0 0 ${sweep} ${number(end.x)} ${number(end.y)}`,
		);
		pen = end;
	});
	return commands.join(" ");
}

/** The unit vector along a horizontal or vertical run. */
function heading(from: Point, to: Point): Point {
	return { x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y) };
}

function start(name: string, attributes: Attribute[]): string {
	return `<${name}${attributesText(attributes)}>`;
}

function empty(name: string, attributes: Attribute[]): string {
	return `<${name}${attributesText(attributes)}/>`;
}

function element(name: string, attributes: Attribute[], text: string): string {
	return `<${name}${attributesText(attributes)}>${escapeText(text)}</${name}>`;
}

function attributesText(attributes: Attribute[]): string {
	return attributes
		.map(([name, value]) => {
			const text = typeof value === "number" ? number(value) : value;
			return ` ${name}="${escapeAttribute(text)}"`;
		})
		.join("");
}

function indent(depth: number, text: string): string {
	return `${"  ".repeat(depth)}${text}`;
}

/** At most two decimals, and never a negative zero. */
function number(value: number): string {
	const rounded = Math.round(value * 100) / 100;
	return String(rounded === 0 ? 0 : rounded);
}

/**
 * A 64-bit FNV-1a hash of the text's UTF-16 code units, in hex. The hash is
 * kept as four 16-bit limbs, lowest first, so that every step is exact in
 * plain numbers, and much faster than in BigInts. Multiplying by the FNV prime,
 * 2⁴⁰ + 0x1b3, is multiplying by 0x1b3 and adding the hash shifted up by 40
 * bits, carrying from limb to limb and dropping what passes 64 bits.
 */
function hash(text: string): string {
	let l0 = 0x2325;
	let l1 = 0x8422;
	let l2 = 0x9ce4;
	let l3 = 0xcbf2;
	for (let index = 0; index < text.length; index++) {
		l0 ^= text.charCodeAt(index);
		let carry = l0 * 0x1b3;
		const r0 = carry & 0xffff;
		carry = (carry >>> 16) + l1 * 0x1b3;
		const r1 = carry & 0xffff;
		carry = (carry >>> 16) + l2 * 0x1b3 + ((l0 << 8) & 0xffff);
		const r2 = carry & 0xffff;
		carry = (carry >>> 16) + l3 * 0x1b3 + (((l1 << 8) | (l0 >>> 8)) & 0xffff);
		l0 = r0;
		l1 = r1;
		l2 = r2;
		l3 = carry & 0xffff;
	}
	return [l3, l2, l1, l0].map((limb) => limb.toString(16).padStart(4, "0")).join("");
}

const base64Digits = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64(bytes: Uint8Array): string {
	let text = "";
	for (let index = 0; index < bytes.length; index += 3) {
		const group =
			((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
		text += base64Digits[(group >> 18) & 63];
		text += base64Digits[(group >> 12) & 63];
		text += index + 1 < bytes.length ? base64Digits[(group >> 6) & 63] : "=";
		text += index + 2 < bytes.length ? base64Digits[group & 63] : "=";
	}
	return text;
}

function escapeText(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(text: string): string {
	return escapeText(text).replaceAll('"', "&quot;");
}
