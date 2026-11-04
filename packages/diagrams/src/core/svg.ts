/**
 * The SVG writer turns a scene into one self-contained SVG. It works out which
 * of the bundled font's glyphs the SVG draws, and embeds the font data that
 * its caller's function gives for them.
 *
 * Its output is deterministic: elements are written in model order and
 * attributes in a fixed order, numbers have at most two decimals and never
 * show a negative zero, and lines end with LF, as does the file.
 */

import type { Point, RoutePoint, Scene, SceneEdge, SceneNode } from "./scene.ts";
import { type FontData, type FontWeight, hasCharacter } from "./text.ts";

type Attribute = readonly [name: string, value: string | number];

const ink = "#1f2328";
const line = "#57606a";
const surface = "#ffffff";
/**
 * Where the embedded font can't be used, text falls back to fonts no wider
 * than Inter, so that text shortened to fit still fits. There's no generic
 * family at the end, since that could be a wider font.
 */
const fallbackFonts = "Helvetica, Arial";
const fontWeights: Record<FontWeight, number> = { regular: 400, semibold: 600 };

export function writeSvg(scene: Scene, fontData?: FontData): string {
	const { bounds } = scene;
	const size: Attribute[] = [
		["viewBox", [bounds.x, bounds.y, bounds.width, bounds.height].map(number).join(" ")],
		["width", bounds.width],
		["height", bounds.height],
	];
	const body = [
		indent(
			1,
			start("g", [
				["fill", "none"],
				["stroke", line],
				["stroke-width", 1.5],
			]),
		),
		...scene.edges.flatMap((edge) => writeEdge(edge).map((text) => indent(2, text))),
		indent(1, "</g>"),
		indent(
			1,
			start("g", [
				["text-anchor", "middle"],
				["dominant-baseline", "central"],
			]),
		),
		...scene.nodes.flatMap((node) => writeNode(node).map((text) => indent(2, text))),
		indent(1, "</g>"),
	];
	const fonts = fontData === undefined ? [] : embeddedFonts(scene, fontData);
	// Inlined into a page, an SVG's style applies to the whole page, so the font's
	// family and every selector carry a name made from everything else in the SVG.
	const contents = [attributesText(size), ...fonts.map((font) => font.data), ...body];
	const scope = `diagram-${hash(contents.join("\n"))}`;
	const lines = [
		start("svg", [["xmlns", "http://www.w3.org/2000/svg"], ["class", scope], ...size]),
		...style(scope, fonts).map((text) => indent(1, text)),
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
	const texts = scene.nodes.map((node) => node.title);
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
 * The embedded font's faces, and one rule for the SVG's root, which every text
 * inherits from. It turns kerning and ligatures off, since measuring ignores them.
 */
function style(scope: string, fonts: EmbeddedFont[]): string[] {
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
		"</style>",
	];
}

function writeNode(node: SceneNode): string[] {
	const { box, title } = node;
	return [
		start("g", [
			["data-node", node.id],
			["data-kind", node.kind],
		]),
		indent(
			1,
			empty("rect", [
				["x", box.x],
				["y", box.y],
				["width", box.width],
				["height", box.height],
				["rx", 6],
				["fill", surface],
				["stroke", line],
			]),
		),
		indent(
			1,
			element(
				"text",
				[
					["x", title.point.x],
					["y", title.point.y],
					["font-size", title.size],
					["font-weight", fontWeights[title.weight]],
					["fill", ink],
				],
				title.text,
			),
		),
		"</g>",
	];
}

function writeEdge(edge: SceneEdge): string[] {
	return [
		start("g", [
			["data-edge", edge.id],
			["data-kind", edge.kind],
			["data-from", edge.from],
			["data-to", edge.to],
		]),
		indent(1, empty("path", [["d", pathData(edge.route)]])),
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
