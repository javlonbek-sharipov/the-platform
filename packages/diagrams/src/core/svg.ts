/**
 * The SVG writer turns a scene into one self-contained SVG.
 *
 * Its output is deterministic: elements are written in model order and
 * attributes in a fixed order, numbers have at most two decimals and never
 * show a negative zero, and lines end with LF, as does the file.
 */

import type { Point, Scene, SceneEdge, SceneNode } from "./scene.ts";
import { type FontData, type FontWeight, hasCharacter } from "./text.ts";

type Attribute = readonly [name: string, value: string | number];

const ink = "#1f2328";
const line = "#57606a";
const surface = "#ffffff";
const fontFamily = "Inter, Helvetica, Arial, sans-serif";
const fontWeights: Record<FontWeight, number> = { regular: 400, semibold: 600 };

export function writeSvg(scene: Scene, fontData?: FontData): string {
	const { bounds } = scene;
	const fonts = fontData === undefined ? [] : embeddedFonts(scene, fontData);
	const lines = [
		start("svg", [
			["xmlns", "http://www.w3.org/2000/svg"],
			["viewBox", [bounds.x, bounds.y, bounds.width, bounds.height].map(number).join(" ")],
			["width", bounds.width],
			["height", bounds.height],
		]),
		...(fonts.length === 0 ? [] : style(fonts).map((text) => indent(1, text))),
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
				["font-family", fontFamily],
				["text-anchor", "middle"],
				["dominant-baseline", "central"],
			]),
		),
		...scene.nodes.flatMap((node) => writeNode(node).map((text) => indent(2, text))),
		indent(1, "</g>"),
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

function style(fonts: EmbeddedFont[]): string[] {
	return [
		"<style>",
		...fonts.map((font) =>
			indent(
				1,
				`@font-face { font-family: "Inter"; font-weight: ${fontWeights[font.weight]}; src: url("data:font/ttf;base64,${font.data}") format("truetype"); }`,
			),
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

function pathData(points: Point[]): string {
	return points
		.map((point, index) => `${index === 0 ? "M" : "L"} ${number(point.x)} ${number(point.y)}`)
		.join(" ");
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
