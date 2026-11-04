/**
 * The SVG writer turns a scene into one self-contained SVG.
 *
 * Its output is deterministic: elements are written in model order and
 * attributes in a fixed order, numbers have at most two decimals and never
 * show a negative zero, and lines end with LF, as does the file.
 */

import type { Point, RoutePoint, Scene, SceneEdge, SceneNode } from "./scene.ts";

type Attribute = readonly [name: string, value: string | number];

const ink = "#1f2328";
const line = "#57606a";
const surface = "#ffffff";
const fontFamily = "Inter, Helvetica, Arial, sans-serif";

export function writeSvg(scene: Scene): string {
	const { bounds } = scene;
	const lines = [
		start("svg", [
			["xmlns", "http://www.w3.org/2000/svg"],
			["viewBox", [bounds.x, bounds.y, bounds.width, bounds.height].map(number).join(" ")],
			["width", bounds.width],
			["height", bounds.height],
		]),
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
				["font-size", 14],
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

function escapeText(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(text: string): string {
	return escapeText(text).replaceAll('"', "&quot;");
}
