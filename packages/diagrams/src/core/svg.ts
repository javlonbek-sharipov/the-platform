/**
 * The SVG writer turns a scene into one self-contained SVG. It works out which
 * of the bundled font's glyphs the SVG draws, and embeds the font data that
 * its caller's function gives for them.
 *
 * Its output is deterministic: elements are written in model order and
 * attributes in a fixed order, numbers have at most two decimals and never
 * show a negative zero, and lines end with LF, as does the file.
 */

import {
	type ArchitectureNodeLook,
	type ArchitectureStatus,
	architectureFamilies,
	architectureNodeKinds,
	architectureNodeLooks,
	architectureStatuses,
} from "../notations/architecture.ts";
import { outlines, type PathData } from "./outlines.ts";
import type {
	Point,
	RoutePoint,
	Scene,
	SceneEdge,
	SceneGroup,
	SceneLabel,
	SceneNode,
	SceneText,
} from "./scene.ts";
import { type FontData, type FontWeight, hasCharacter } from "./text.ts";
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

export function writeSvg(scene: Scene, fontData?: FontData): string {
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
					indent(1, start("g", [["class", "diagram-groups"], ...textAttributes])),
					...scene.groups.flatMap((group) => writeGroup(group).map((text) => indent(2, text))),
					indent(1, "</g>"),
				]),
		indent(
			1,
			start("g", [
				["class", "diagram-edges"],
				["fill", "none"],
				["stroke-width", 1.5],
			]),
		),
		...scene.edges.flatMap((edge) => writeEdge(edge).map((text) => indent(2, text))),
		indent(1, "</g>"),
		...(labels.length === 0
			? []
			: [
					indent(1, start("g", [["class", "diagram-labels"], ...textAttributes])),
					...labels.flatMap(([id, label]) => writeLabel(id, label).map((text) => indent(2, text))),
					indent(1, "</g>"),
				]),
		indent(1, start("g", textAttributes)),
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
		start("svg", [["xmlns", "http://www.w3.org/2000/svg"], ["class", scope], ...size]),
		...style(scope, fonts, uses).map((text) => indent(1, text)),
		...body,
		"</svg>",
	];
	return `${lines.join("\n")}\n`;
}

/** Every text is centered on its point. */
const textAttributes: Attribute[] = [
	["text-anchor", "middle"],
	["dominant-baseline", "central"],
];

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
			: [{ selector: ".diagram-edges", property: "stroke", color: "muted" } as const]),
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
 * tinted and stroked in the Kind's hue; its badge and title; a line across it
 * above its Rows, and their names and values; its status mark; and its
 * callout's tag.
 */
function writeNode(node: SceneNode): string[] {
	const { box, badge, title, rows, callout } = node;
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
		writeText(title, "diagram-text"),
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

function writeText(text: SceneText, className: string): string {
	return element(
		"text",
		[
			["class", className],
			["x", text.point.x],
			["y", text.point.y],
			["font-size", text.size],
			["font-weight", fontWeights[text.weight]],
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

/** Path data, with its numbers written as every number in the SVG is. */
function pathText(path: PathData): string {
	return path.map((part) => (typeof part === "number" ? number(part) : part)).join(" ");
}

function writeEdge(edge: SceneEdge): string[] {
	return [
		start("g", [
			["data-edge", edge.id],
			["data-kind", edge.kind],
			["data-from", edge.from],
			...(edge.fromRow === undefined ? [] : [["data-from-row", edge.fromRow] as const]),
			["data-to", edge.to],
			...(edge.toRow === undefined ? [] : [["data-to-row", edge.toRow] as const]),
		]),
		indent(1, empty("path", [["d", pathData(edge.route)]])),
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
 * with a dot between them.
 */
function writeLabel(id: string, label: SceneLabel): string[] {
	const { box, text, technology, rate } = label;
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

const hashSize = 1n << 64n;

/** A 64-bit FNV-1a hash of the text's UTF-16 code units, in hex. */
function hash(text: string): string {
	let value = 0xcbf29ce484222325n;
	for (let index = 0; index < text.length; index++) {
		value ^= BigInt(text.charCodeAt(index));
		value = (value * 0x100000001b3n) % hashSize;
	}
	return value.toString(16).padStart(16, "0");
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
