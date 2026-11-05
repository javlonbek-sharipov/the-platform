/**
 * Diagrams drawn for tests that look at what a viewer sees: the scene, and the
 * SVG read back with its style, and the parts of a Node's drawing.
 */

import {
	type Box,
	type RenderOptions,
	render,
	type Scene,
	type SceneEdge,
	type SceneNode,
} from "../../src/index.ts";
import {
	colorUnder,
	computedStyle,
	descendants,
	type Element,
	isShape,
	type Point,
	paintedBounds,
	parseColor,
	parseSvg,
	type Rule,
	rulesOf,
	runsOf,
	type Theme,
} from "./svg.ts";

export function sceneOf(diagram: unknown, options?: RenderOptions): Scene {
	const { scene } = render(diagram, options);
	if (scene === undefined) {
		throw new Error("expected a scene");
	}
	return scene;
}

export function nodeOf(scene: Scene, id: string): SceneNode {
	const node = scene.nodes.find((candidate) => candidate.id === id);
	if (node === undefined) {
		throw new Error(`no Node ${id} in the scene`);
	}
	return node;
}

/** A Diagram drawn: its scene, and its SVG read back, with its style. */
export interface Drawn {
	scene: Scene;
	root: Element;
	rules: Rule[];
}

export function draw(diagram: unknown, options?: RenderOptions): Drawn {
	const { scene, svg } = render(diagram, options);
	if (scene === undefined || svg === undefined) {
		throw new Error("expected a scene and an SVG");
	}
	const root = parseSvg(svg);
	return { scene, root, rules: rulesOf(root) };
}

/** The group that draws a Node, which carries its id. */
export function groupOf({ root }: Drawn, id: string): Element {
	const group = descendants(root).find((element) => element.attributes.get("data-node") === id);
	if (group === undefined) {
		throw new Error(`no group draws Node ${id}`);
	}
	return group;
}

export function shapesOf(drawn: Drawn, id: string): Element[] {
	return descendants(groupOf(drawn, id)).filter(isShape);
}

/** Painted bounds may pass a box by the rounding of their numbers, to two decimals. */
const rounding = 0.01;

export function paintsWithin(drawn: Drawn, shape: Element, box: Box): boolean {
	const painted = paintedBounds(shape, drawn.rules, "light");
	return (
		painted.left >= box.x - rounding &&
		painted.top >= box.y - rounding &&
		painted.right <= box.x + box.width + rounding &&
		painted.bottom <= box.y + box.height + rounding
	);
}

/** A shape as it looks without color: where it paints, from an origin, and how. */
export function withoutColor(drawn: Drawn, shape: Element, origin: Point): string {
	const style = computedStyle(shape, drawn.rules, "light");
	const half = (value: number) => Math.round(value * 2) / 2;
	const runs = runsOf(shape).map((run) =>
		run.map(({ x, y }) => `${half(x - origin.x)},${half(y - origin.y)}`).join(" "),
	);
	return [
		runs.join(" | "),
		style.get("fill") === "none" ? "unfilled" : "filled",
		style.get("stroke") === "none" ? "unstroked" : `stroked ${style.get("stroke-width")}`,
		`dashes ${style.get("stroke-dasharray")}`,
	].join("; ");
}

/** A Node's badge and the rest of its drawing, each as it looks without color. */
export function looksOf(drawn: Drawn, id: string): { badge: string; outline: string } {
	const node = nodeOf(drawn.scene, id);
	const shapes = shapesOf(drawn, id);
	const inBadge = shapes.filter((shape) => paintsWithin(drawn, shape, node.badge));
	const rest = shapes.filter((shape) => !inBadge.includes(shape));
	return {
		badge: inBadge.map((shape) => withoutColor(drawn, shape, node.badge)).join("\n"),
		outline: rest.map((shape) => withoutColor(drawn, shape, node.box)).join("\n"),
	};
}

/** The colors a Node's shapes are stroked in, in a theme. */
export function strokesOf(drawn: Drawn, id: string, theme: Theme): Set<string> {
	return new Set(
		shapesOf(drawn, id)
			.map((shape) => computedStyle(shape, drawn.rules, theme).get("stroke") ?? "none")
			.filter((stroke) => stroke !== "none"),
	);
}

/** The color behind a Node's title, and behind the drawing's empty corner, in a theme. */
export function fillAndBackground(drawn: Drawn, id: string, theme: Theme) {
	const title = descendants(groupOf(drawn, id)).find((element) => element.name === "text");
	if (title === undefined) {
		throw new Error(`Node ${id} draws no title`);
	}
	const { point } = nodeOf(drawn.scene, id).title;
	const { bounds } = drawn.scene;
	const corner = { x: bounds.x + 1, y: bounds.y + 1 };
	return {
		fill: colorUnder(drawn.root, title, point, drawn.rules, theme),
		background: colorUnder(drawn.root, title, corner, drawn.rules, theme),
	};
}

/** The group that draws an Edge, which carries its id. */
export function edgeGroupOf({ root }: Drawn, id: string): Element {
	const group = descendants(root).find((element) => element.attributes.get("data-edge") === id);
	if (group === undefined) {
		throw new Error(`no group draws Edge ${id}`);
	}
	return group;
}

/** How far a point lies from the nearest run of a route. */
export function distanceToRoute(point: Point, route: Point[]): number {
	let nearest = Number.POSITIVE_INFINITY;
	route.slice(1).forEach((b, index) => {
		const a = route[index] ?? b;
		const x = Math.max(Math.min(a.x, b.x), Math.min(point.x, Math.max(a.x, b.x)));
		const y = Math.max(Math.min(a.y, b.y), Math.min(point.y, Math.max(a.y, b.y)));
		nearest = Math.min(nearest, Math.hypot(point.x - x, point.y - y));
	});
	return nearest;
}

/**
 * Rounded corners cut inside a route's corner points by at most this much: a
 * corner's arc, of radius 8 at most, passes 8 × (1 − 1/√2) from its corner.
 */
const cornerCut = 2.4;

/**
 * The strokes that draw an Edge's line, in the order they're painted: the
 * unfilled, stroked shapes of its group that follow its route all the way from
 * one Port to the other, give or take the arrowhead at its target.
 */
export function linesOf(drawn: Drawn, edge: SceneEdge, theme: Theme = "light"): Element[] {
	const start = edge.route[0];
	const end = edge.route.at(-1);
	return descendants(edgeGroupOf(drawn, edge.id)).filter((shape) => {
		if (!isShape(shape) || start === undefined || end === undefined) {
			return false;
		}
		const points = runsOf(shape).flat();
		const near = (target: Point, within: number) =>
			points.some((point) => Math.hypot(point.x - target.x, point.y - target.y) <= within);
		if (
			!near(start, 1) ||
			!near(end, 12) ||
			!points.every((point) => distanceToRoute(point, edge.route) <= cornerCut)
		) {
			return false;
		}
		const style = computedStyle(shape, drawn.rules, theme);
		return style.get("fill") === "none" && style.get("stroke") !== "none";
	});
}

export function strokeOf(drawn: Drawn, shape: Element, theme: Theme) {
	const style = computedStyle(shape, drawn.rules, theme);
	const color = parseColor(style.get("stroke") ?? "");
	if (color === undefined) {
		throw new Error(`a stroke this test can't read: ${style.get("stroke")}`);
	}
	return {
		color,
		width: Number(style.get("stroke-width")),
		dashes: style.get("stroke-dasharray") ?? "none",
	};
}
