/**
 * A small reader for the SVGs the engine writes: their elements, the style
 * that colors them in each theme, the geometry of their shapes, and the colors
 * a viewer would see. It's written separately from the engine, so that tests
 * don't trust the code under test. It reads only what SVG and CSS define, not
 * the engine's class names.
 */

export interface Element {
	name: string;
	attributes: Map<string, string>;
	children: Element[];
	parent?: Element;
	/** The text directly inside it, unescaped. */
	text: string;
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntities(text: string): string {
	return text.replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => entities[name] ?? "");
}

/** Parses well-formed SVG markup, as the engine writes it, into its root element. */
export function parseSvg(svg: string): Element {
	const top: Element = { name: "#document", attributes: new Map(), children: [], text: "" };
	const open: Element[] = [top];
	const tokens = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g;
	for (const [whole, closing, name, attributes = "", selfClosing, text] of svg.matchAll(tokens)) {
		const parent = open.at(-1);
		if (parent === undefined) {
			throw new Error(`markup after the root element: ${whole.slice(0, 40)}`);
		}
		if (text !== undefined) {
			parent.text += decodeEntities(text);
		} else if (closing === "/") {
			if (parent.name !== name) {
				throw new Error(`</${name}> closes <${parent.name}>`);
			}
			open.pop();
		} else {
			const element: Element = {
				name: name ?? "",
				attributes: new Map(),
				children: [],
				parent,
				text: "",
			};
			for (const [, key = "", value = ""] of attributes.matchAll(/([\w:.-]+)="([^"]*)"/g)) {
				element.attributes.set(key, decodeEntities(value));
			}
			parent.children.push(element);
			if (selfClosing !== "/") {
				open.push(element);
			}
		}
	}
	const root = top.children[0];
	if (open.length !== 1 || root === undefined || top.children.length !== 1) {
		throw new Error("the markup isn't one well-formed element");
	}
	root.parent = undefined;
	return root;
}

/** The element and everything inside it, in document order. */
export function descendants(element: Element): Element[] {
	return [element, ...element.children.flatMap(descendants)];
}

export function ancestors(element: Element): Element[] {
	const found: Element[] = [];
	for (let parent = element.parent; parent !== undefined; parent = parent.parent) {
		found.push(parent);
	}
	return found;
}

// Style

export type Theme = "light" | "dark";

export interface Rule {
	selectors: string[];
	declarations: [property: string, value: string][];
	/** Whether the rule sits in a `prefers-color-scheme: dark` block. */
	dark: boolean;
}

/** The style rules of the SVG's `<style>` elements, leaving out `@font-face`. */
export function rulesOf(root: Element): Rule[] {
	const css = descendants(root)
		.filter((element) => element.name === "style")
		.map((element) => element.text)
		.join("\n");
	const rules: Rule[] = [];
	const read = (text: string, dark: boolean) => {
		let at = 0;
		while (at < text.length) {
			const open = text.indexOf("{", at);
			if (open < 0) {
				if (text.slice(at).trim() !== "") {
					throw new Error(`stray style text: ${text.slice(at, at + 40)}`);
				}
				return;
			}
			const prelude = text.slice(at, open).trim();
			const close = matchingBrace(text, open);
			const body = text.slice(open + 1, close);
			if (prelude.startsWith("@media")) {
				if (!/^@media \(prefers-color-scheme: dark\)$/.test(prelude)) {
					throw new Error(`unexpected media query: ${prelude}`);
				}
				read(body, true);
			} else if (!prelude.startsWith("@font-face")) {
				if (prelude.startsWith("@")) {
					throw new Error(`unexpected at-rule: ${prelude}`);
				}
				rules.push({
					selectors: prelude.split(",").map((part) => part.trim()),
					declarations: declarationsOf(body),
					dark,
				});
			}
			at = close + 1;
		}
	};
	read(css, false);
	return rules;
}

function matchingBrace(text: string, open: number): number {
	let depth = 0;
	for (let at = open; at < text.length; at++) {
		if (text[at] === "{") {
			depth += 1;
		} else if (text[at] === "}") {
			depth -= 1;
			if (depth === 0) {
				return at;
			}
		}
	}
	throw new Error("unbalanced braces in the style");
}

export function declarationsOf(block: string): [string, string][] {
	return block
		.split(";")
		.map((declaration) => declaration.trim())
		.filter((declaration) => declaration !== "")
		.map((declaration) => {
			const colon = declaration.indexOf(":");
			return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()];
		});
}

interface Compound {
	type?: string;
	classes: string[];
	attributes: [name: string, value: string | undefined][];
}

function parseSelector(selector: string): Compound[] {
	return selector.split(/\s+/).map((part) => {
		const match = part.match(/^([a-zA-Z][\w-]*)?((?:\.[\w-]+|\[[\w-]+(?:="[^"]*")?\])*)$/);
		if (match === null) {
			throw new Error(`a selector this reader doesn't know: ${selector}`);
		}
		const [, type, rest = ""] = match;
		return {
			...(type === undefined ? {} : { type }),
			classes: [...rest.matchAll(/\.([\w-]+)/g)].map(([, name = ""]) => name),
			attributes: [...rest.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map(
				([, name = "", value]) => [name, value] as [string, string | undefined],
			),
		};
	});
}

function matchesCompound(element: Element, compound: Compound): boolean {
	const classes = (element.attributes.get("class") ?? "").split(/\s+/);
	return (
		(compound.type === undefined || compound.type === element.name) &&
		compound.classes.every((name) => classes.includes(name)) &&
		compound.attributes.every(([name, value]) =>
			value === undefined ? element.attributes.has(name) : element.attributes.get(name) === value,
		)
	);
}

/** Whether a selector, made of compounds joined by descendant combinators, matches the element. */
export function matches(element: Element, selector: string): boolean {
	const compounds = parseSelector(selector);
	const last = compounds.at(-1);
	if (last === undefined || !matchesCompound(element, last)) {
		return false;
	}
	let remaining = compounds.slice(0, -1);
	for (const ancestor of ancestors(element)) {
		const next = remaining.at(-1);
		if (next === undefined) {
			break;
		}
		if (matchesCompound(ancestor, next)) {
			remaining = remaining.slice(0, -1);
		}
	}
	return remaining.length === 0;
}

function specificity(selector: string): number {
	return parseSelector(selector).reduce(
		(total, { type, classes, attributes }) =>
			total + 1000 * (classes.length + attributes.length) + (type === undefined ? 0 : 1),
		0,
	);
}

/** SVG's presentation attributes that this reader resolves, and whether each one is inherited. */
const properties: Record<string, boolean> = {
	fill: true,
	"fill-opacity": true,
	stroke: true,
	"stroke-opacity": true,
	"stroke-width": true,
	"stroke-dasharray": true,
	color: true,
	opacity: false,
	display: false,
};
const initial: Record<string, string> = {
	fill: "#000000",
	"fill-opacity": "1",
	stroke: "none",
	"stroke-opacity": "1",
	"stroke-width": "1",
	"stroke-dasharray": "none",
	color: "#000000",
	opacity: "1",
	display: "inline",
};

/**
 * The element's computed value of each property this reader knows, in a theme,
 * as a viewer that defines none of the `--diagram-` properties would see it:
 * every `var()` takes its fallback. `currentColor` resolves to `color`.
 */
export function computedStyle(element: Element, rules: Rule[], theme: Theme): Map<string, string> {
	const style = specifiedStyle(element, rules, theme);
	const color = style.get("color") ?? initial.color ?? "";
	for (const property of ["fill", "stroke"]) {
		if (style.get(property) === "currentColor") {
			style.set(property, color);
		}
	}
	return style;
}

/**
 * The element's values with `currentColor` left as a keyword, which is how
 * its children inherit it: each child resolves it to its own `color`.
 */
function specifiedStyle(element: Element, rules: Rule[], theme: Theme): Map<string, string> {
	const parent =
		element.parent === undefined ? undefined : specifiedStyle(element.parent, rules, theme);
	const style = new Map<string, string>();
	for (const [property, inherited] of Object.entries(properties)) {
		const value = inherited ? parent?.get(property) : undefined;
		style.set(property, value ?? initial[property] ?? "");
	}
	for (const property of Object.keys(properties)) {
		const value = element.attributes.get(property);
		if (value !== undefined) {
			style.set(property, value);
		}
	}
	const applying = rules
		.map((rule, order) => ({ rule, order }))
		.filter(({ rule }) => theme === "dark" || !rule.dark)
		.flatMap(({ rule, order }) =>
			rule.selectors
				.filter((selector) => matches(element, selector))
				.map((selector) => ({ rule, order, specificity: specificity(selector) })),
		)
		.sort((a, b) => a.specificity - b.specificity || a.order - b.order);
	for (const { rule } of applying) {
		for (const [property, value] of rule.declarations) {
			if (property in properties) {
				style.set(property, fallbackOf(value));
			}
		}
	}
	return style;
}

/** A `var(--name, fallback)` as a viewer without the property sees it: its fallback. */
export function fallbackOf(value: string): string {
	return value.replace(/var\(\s*--[\w-]+\s*,\s*([^)]+?)\s*\)/g, "$1");
}

// Geometry

export interface Point {
	x: number;
	y: number;
}

export interface Bounds {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** The translation that the element's `transform`, and its ancestors', add up to. */
function translationOf(element: Element): Point {
	let x = 0;
	let y = 0;
	for (const each of [element, ...ancestors(element)]) {
		const transform = each.attributes.get("transform");
		if (transform !== undefined) {
			const match = transform.match(/^translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)$/);
			if (match === null) {
				throw new Error(`a transform this reader doesn't know: ${transform}`);
			}
			x += Number(match[1]);
			y += Number(match[2]);
		}
	}
	return { x, y };
}

const shapeNames = new Set(["rect", "circle", "ellipse", "line", "path", "polygon", "polyline"]);

export function isShape(element: Element): boolean {
	return shapeNames.has(element.name);
}

const number = (element: Element, name: string) => Number(element.attributes.get(name) ?? 0);

/** A shape's outline, as closed or open runs of points, with arcs sampled finely. */
export function runsOf(element: Element): Point[][] {
	const shift = translationOf(element);
	const runs = localRuns(element);
	return runs.map((run) => run.map(({ x, y }) => ({ x: x + shift.x, y: y + shift.y })));
}

function ellipsePoints(cx: number, cy: number, rx: number, ry: number): Point[] {
	return Array.from({ length: 64 }, (_, index) => {
		const angle = (index / 64) * 2 * Math.PI;
		return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
	});
}

function localRuns(element: Element): Point[][] {
	switch (element.name) {
		case "rect": {
			const [x, y, width, height] = ["x", "y", "width", "height"].map((name) =>
				number(element, name),
			) as [number, number, number, number];
			return [
				[
					{ x, y },
					{ x: x + width, y },
					{ x: x + width, y: y + height },
					{ x, y: y + height },
				],
			];
		}
		case "circle":
			return [
				ellipsePoints(
					number(element, "cx"),
					number(element, "cy"),
					number(element, "r"),
					number(element, "r"),
				),
			];
		case "ellipse":
			return [
				ellipsePoints(
					number(element, "cx"),
					number(element, "cy"),
					number(element, "rx"),
					number(element, "ry"),
				),
			];
		case "line":
			return [
				[
					{ x: number(element, "x1"), y: number(element, "y1") },
					{ x: number(element, "x2"), y: number(element, "y2") },
				],
			];
		case "polygon":
		case "polyline": {
			const values = (element.attributes.get("points") ?? "")
				.trim()
				.split(/[\s,]+/)
				.map(Number);
			const points: Point[] = [];
			for (let index = 0; index + 1 < values.length; index += 2) {
				points.push({ x: values[index] ?? 0, y: values[index + 1] ?? 0 });
			}
			return [points];
		}
		case "path":
			return pathRuns(element.attributes.get("d") ?? "");
		default:
			throw new Error(`<${element.name}> isn't a shape`);
	}
}

/** The runs of a path's data: one per subpath, with arcs sampled. Supports M, L, H, V, A and Z. */
export function pathRuns(d: string): Point[][] {
	const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
	const runs: Point[][] = [];
	let run: Point[] = [];
	let current = { x: 0, y: 0 };
	let start = { x: 0, y: 0 };
	let command = "";
	let at = 0;
	const next = () => Number(tokens[at++]);
	while (at < tokens.length) {
		const token = tokens[at] ?? "";
		if (/[a-zA-Z]/.test(token)) {
			command = token;
			at += 1;
		} else if (command === "M") {
			command = "L";
		} else if (command === "m") {
			command = "l";
		}
		const relative = command === command.toLowerCase();
		const base = relative ? current : { x: 0, y: 0 };
		switch (command.toUpperCase()) {
			case "M": {
				if (run.length > 0) {
					runs.push(run);
				}
				current = { x: base.x + next(), y: base.y + next() };
				start = current;
				run = [current];
				break;
			}
			case "L":
				current = { x: base.x + next(), y: base.y + next() };
				run.push(current);
				break;
			case "H":
				current = { x: (relative ? current.x : 0) + next(), y: current.y };
				run.push(current);
				break;
			case "V":
				current = { x: current.x, y: (relative ? current.y : 0) + next() };
				run.push(current);
				break;
			case "A": {
				const [rx, ry, rotation, large, sweep] = [next(), next(), next(), next(), next()];
				const end = { x: base.x + next(), y: base.y + next() };
				run.push(...arcPoints(current, end, rx, ry, rotation, large !== 0, sweep !== 0));
				current = end;
				break;
			}
			case "Z":
				current = start;
				if (run.length > 0) {
					runs.push(run);
				}
				run = [];
				break;
			default:
				throw new Error(`a path command this reader doesn't know: ${command}`);
		}
	}
	if (run.length > 0) {
		runs.push(run);
	}
	return runs;
}

/** Points along an elliptical arc, after the SVG specification's endpoint-to-center conversion. */
function arcPoints(
	from: Point,
	to: Point,
	rxIn: number,
	ryIn: number,
	rotation: number,
	large: boolean,
	sweep: boolean,
): Point[] {
	if (rxIn === 0 || ryIn === 0) {
		return [to];
	}
	const phi = (rotation * Math.PI) / 180;
	const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
	const dx = (from.x - to.x) / 2;
	const dy = (from.y - to.y) / 2;
	const x1 = cos * dx + sin * dy;
	const y1 = -sin * dx + cos * dy;
	let [rx, ry] = [Math.abs(rxIn), Math.abs(ryIn)];
	const scale = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
	if (scale > 1) {
		rx *= Math.sqrt(scale);
		ry *= Math.sqrt(scale);
	}
	const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
	const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
	const factor = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
	const cx1 = (factor * rx * y1) / ry;
	const cy1 = (-factor * ry * x1) / rx;
	const cx = cos * cx1 - sin * cy1 + (from.x + to.x) / 2;
	const cy = sin * cx1 + cos * cy1 + (from.y + to.y) / 2;
	const angle = (ux: number, uy: number, vx: number, vy: number) => {
		const sign = ux * vy - uy * vx < 0 ? -1 : 1;
		const dot = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
		return sign * Math.acos(Math.min(1, Math.max(-1, dot)));
	};
	const theta = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
	let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
	if (!sweep && delta > 0) {
		delta -= 2 * Math.PI;
	} else if (sweep && delta < 0) {
		delta += 2 * Math.PI;
	}
	const steps = 32;
	return Array.from({ length: steps }, (_, index) => {
		const t = theta + (delta * (index + 1)) / steps;
		const [x, y] = [rx * Math.cos(t), ry * Math.sin(t)];
		return { x: cos * x - sin * y + cx, y: sin * x + cos * y + cy };
	});
}

/** Where a shape paints, stroke included, as a viewer sees it in a theme. */
export function paintedBounds(element: Element, rules: Rule[], theme: Theme): Bounds {
	const points = runsOf(element).flat();
	const style = computedStyle(element, rules, theme);
	const half = style.get("stroke") === "none" ? 0 : Number(style.get("stroke-width")) / 2;
	return {
		left: Math.min(...points.map((point) => point.x)) - half,
		top: Math.min(...points.map((point) => point.y)) - half,
		right: Math.max(...points.map((point) => point.x)) + half,
		bottom: Math.max(...points.map((point) => point.y)) + half,
	};
}

/** Whether a shape's fill covers a point, by SVG's default nonzero rule. */
export function fillContains(element: Element, point: Point): boolean {
	let winding = 0;
	for (const run of runsOf(element)) {
		run.forEach((a, index) => {
			const b = run[(index + 1) % run.length] ?? a;
			const side = (b.x - a.x) * (point.y - a.y) - (point.x - a.x) * (b.y - a.y);
			if (a.y <= point.y && b.y > point.y && side > 0) {
				winding += 1;
			} else if (a.y > point.y && b.y <= point.y && side < 0) {
				winding -= 1;
			}
		});
	}
	return winding !== 0;
}

// Color

export type Color = [red: number, green: number, blue: number];

export function parseColor(text: string): Color | undefined {
	const match = text.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
	if (match === null) {
		return undefined;
	}
	const hex = match[1] ?? "";
	const digits =
		hex.length === 3 ? [...hex].map((digit) => digit + digit) : (hex.match(/../g) ?? []);
	return digits.map((pair) => Number.parseInt(pair, 16)) as Color;
}

/** WCAG 2's relative luminance. */
export function luminance([red, green, blue]: Color): number {
	const linear = (channel: number) => {
		const value = channel / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/** WCAG 2's contrast ratio between two colors. */
export function contrast(a: Color, b: Color): number {
	const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
	return (lighter + 0.05) / (darker + 0.05);
}

function over(under: Color, color: Color, alpha: number): Color {
	return under.map(
		(channel, index) => channel * (1 - alpha) + (color[index] ?? 0) * alpha,
	) as Color;
}

/**
 * The color a viewer sees at a point just before `element` is painted, in a
 * theme: every fill painted before it that covers the point, blended in order.
 * Throws if nothing opaque lies under the point.
 */
export function colorUnder(
	root: Element,
	element: Element,
	point: Point,
	rules: Rule[],
	theme: Theme,
): Color {
	let seen: Color | undefined;
	for (const each of descendants(root)) {
		if (each === element) {
			break;
		}
		if (!isShape(each) || ancestors(each).some((ancestor) => ancestor.name === "defs")) {
			continue;
		}
		const style = computedStyle(each, rules, theme);
		const fill = style.get("fill") ?? "none";
		if (fill === "none" || style.get("display") === "none" || !fillContains(each, point)) {
			continue;
		}
		const color = parseColor(fill);
		if (color === undefined) {
			throw new Error(`a fill this reader can't read: ${fill}`);
		}
		const alpha = Number(style.get("fill-opacity")) * Number(style.get("opacity"));
		if (seen === undefined && alpha < 1) {
			throw new Error("a translucent fill with nothing opaque under it");
		}
		seen = seen === undefined ? color : over(seen, color, alpha);
	}
	if (seen === undefined) {
		throw new Error(`nothing is painted under (${point.x}, ${point.y})`);
	}
	return seen;
}
