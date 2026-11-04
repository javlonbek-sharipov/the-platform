import { describe, expect, test } from "vitest";
import {
	type ArchitectureNodeKind,
	architecture,
	architectureNodeKinds,
	architectureNodeLooks,
	type Box,
	type Direction,
	render,
	type Scene,
	type SceneNode,
} from "../src/index.ts";
import {
	colorUnder,
	computedStyle,
	contrast,
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
} from "./support/svg.ts";

const directions: Direction[] = ["right", "down"];

function sceneOf(diagram: unknown): Scene {
	const { scene } = render(diagram);
	if (scene === undefined) {
		throw new Error("expected a scene");
	}
	return scene;
}

/** One Node of each architecture Kind, with ids named after their Kinds, all with one title. */
function oneOfEach(title: string, direction: Direction = "right") {
	return architecture({ title: "Kinds", direction }, (d) => {
		for (const kind of architectureNodeKinds) {
			d.node({ id: kind, kind, title });
		}
	});
}

function nodeOf(scene: Scene, id: string): SceneNode {
	const node = scene.nodes.find((candidate) => candidate.id === id);
	if (node === undefined) {
		throw new Error(`no Node ${id} in the scene`);
	}
	return node;
}

describe("each architecture Kind", () => {
	test("is the size its Notation sets, whatever its title", () => {
		for (const title of ["Shop", "Warehouse inventory reconciliation service"]) {
			const scene = sceneOf(oneOfEach(title));
			for (const kind of architectureNodeKinds) {
				const { box } = nodeOf(scene, kind);
				const look = architectureNodeLooks[kind];
				expect([box.width, box.height], `${kind}, titled ${title}`).toEqual([
					look.width,
					look.height,
				]);
			}
		}
	});

	test.each(directions)("lands its corners and Ports on the grid, laid out %s", (direction) => {
		const scene = sceneOf(oneOfEach("Shop", direction));
		for (const { id, box, input, output } of scene.nodes) {
			const points = [
				box,
				{ x: box.x + box.width, y: box.y + box.height },
				input.point,
				output.point,
			];
			for (const { x, y } of points) {
				expect([x % scene.grid, y % scene.grid], id).toEqual([0, 0]);
			}
		}
	});
});

/** Whether `inner` lies within `outer`, edges included. */
function within(inner: Box, outer: Box): boolean {
	return (
		inner.x >= outer.x &&
		inner.y >= outer.y &&
		inner.x + inner.width <= outer.x + outer.width &&
		inner.y + inner.height <= outer.y + outer.height
	);
}

describe("a Node's header", () => {
	test.each(directions)(
		"holds the badge at its start, and the title after it, laid out %s",
		(direction) => {
			for (const node of sceneOf(oneOfEach("Shop", direction)).nodes) {
				const { id, box, header, badge, title } = node;
				expect(within(header, box), id).toBe(true);
				expect(header.width, id).toBe(box.width);
				expect(within(badge, header), id).toBe(true);
				expect(badge.x - header.x, id).toBeLessThan(
					header.x + header.width - (badge.x + badge.width),
				);
				expect(title.shortened, id).toBe(false);
				expect(title.point.y, id).toBe(header.y + header.height / 2);
				expect(title.point.x - title.width / 2, id).toBeGreaterThan(badge.x + badge.width);
				expect(title.point.x + title.width / 2, id).toBeLessThan(box.x + box.width);
			}
		},
	);

	test("shortens a title before it would touch the badge or leave the Node", () => {
		const long = "Warehouse inventory reconciliation service";
		for (const node of sceneOf(oneOfEach(long)).nodes) {
			const { id, box, badge, title } = node;
			expect(title.shortened, id).toBe(true);
			expect(title.text, id).toMatch(/\S…$/);
			expect(title.point.x - title.width / 2, id).toBeGreaterThan(badge.x + badge.width);
			expect(title.point.x + title.width / 2, id).toBeLessThan(box.x + box.width);
		}
	});

	test("has the header Ports level with it, laid out right", () => {
		for (const { id, header, input, output } of sceneOf(oneOfEach("Shop")).nodes) {
			const middle = header.y + header.height / 2;
			expect([input.point.y, output.point.y], id).toEqual([middle, middle]);
		}
	});

	test("is the band below a person's head", () => {
		const person = nodeOf(sceneOf(oneOfEach("Shop")), "person");
		expect(person.header.y).toBeGreaterThan(person.box.y);
		expect(person.header.y + person.header.height).toBe(person.box.y + person.box.height);
		const service = nodeOf(sceneOf(oneOfEach("Shop")), "service");
		expect(service.header).toEqual(service.box);
	});
});

/** A Diagram drawn: its scene, and its SVG read back, with its style. */
interface Drawn {
	scene: Scene;
	root: Element;
	rules: Rule[];
}

function draw(diagram: unknown): Drawn {
	const { scene, svg } = render(diagram);
	if (scene === undefined || svg === undefined) {
		throw new Error("expected a scene and an SVG");
	}
	const root = parseSvg(svg);
	return { scene, root, rules: rulesOf(root) };
}

/** The group that draws a Node, which carries its id. */
function groupOf({ root }: Drawn, id: string): Element {
	const group = descendants(root).find((element) => element.attributes.get("data-node") === id);
	if (group === undefined) {
		throw new Error(`no group draws Node ${id}`);
	}
	return group;
}

function shapesOf(drawn: Drawn, id: string): Element[] {
	return descendants(groupOf(drawn, id)).filter(isShape);
}

/** Painted bounds may pass a box by the rounding of their numbers, to two decimals. */
const rounding = 0.01;

function paintsWithin(drawn: Drawn, shape: Element, box: Box): boolean {
	const painted = paintedBounds(shape, drawn.rules, "light");
	return (
		painted.left >= box.x - rounding &&
		painted.top >= box.y - rounding &&
		painted.right <= box.x + box.width + rounding &&
		painted.bottom <= box.y + box.height + rounding
	);
}

/** A shape as it looks without color: where it paints, from an origin, and how. */
function withoutColor(drawn: Drawn, shape: Element, origin: Point): string {
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
function looksOf(drawn: Drawn, id: string): { badge: string; outline: string } {
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
function strokesOf(drawn: Drawn, id: string, theme: Theme): Set<string> {
	return new Set(
		shapesOf(drawn, id)
			.map((shape) => computedStyle(shape, drawn.rules, theme).get("stroke") ?? "none")
			.filter((stroke) => stroke !== "none"),
	);
}

/** The color behind a Node's title, and behind the drawing's empty corner, in a theme. */
function fillAndBackground(drawn: Drawn, id: string, theme: Theme) {
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

describe("each Kind's drawing", () => {
	test.each(directions)("lies inside its Node's rectangle, laid out %s", (direction) => {
		const drawn = draw(oneOfEach("Shop", direction));
		for (const node of drawn.scene.nodes) {
			const shapes = shapesOf(drawn, node.id);
			expect(shapes.length, node.id).toBeGreaterThan(1);
			for (const shape of shapes) {
				expect(paintsWithin(drawn, shape, node.box), `${node.id}: <${shape.name}>`).toBe(true);
			}
		}
	});

	test("has a badge and an outline that each differ from every other Kind's, without color", () => {
		const looks = architectureNodeKinds.map((kind) => looksOf(draw(oneOfEach("Shop")), kind));
		for (const part of ["badge", "outline"] as const) {
			const drawings = looks.map((look) => look[part]);
			expect(
				drawings.every((drawing) => drawing !== ""),
				part,
			).toBe(true);
			expect(new Set(drawings).size, part).toBe(architectureNodeKinds.length);
		}
	});

	test("is in its Kind's hue, which the Kinds of other families don't share", () => {
		const drawn = draw(oneOfEach("Shop"));
		for (const theme of ["light", "dark"] as const) {
			const hues = new Map<ArchitectureNodeKind, string>();
			for (const kind of architectureNodeKinds) {
				const strokes = [...strokesOf(drawn, kind, theme)];
				expect(strokes, `${kind}, ${theme}`).toHaveLength(1);
				hues.set(kind, strokes[0] ?? "");
			}
			expect(new Set(hues.values()).size, theme).toBeGreaterThan(1);
			for (const a of architectureNodeKinds) {
				for (const b of architectureNodeKinds) {
					const sameFamily = architectureNodeLooks[a].family === architectureNodeLooks[b].family;
					expect(hues.get(a) === hues.get(b), `${a} and ${b}, ${theme}`).toBe(sameFamily);
				}
			}
		}
	});

	test("makes a system look heavier than a service", () => {
		const drawn = draw(oneOfEach("Shop"));
		const system = nodeOf(drawn.scene, "system").box;
		const service = nodeOf(drawn.scene, "service").box;
		expect(system.width).toBeGreaterThan(service.width);
		expect(system.height).toBeGreaterThan(service.height);

		const widest = (id: string) =>
			Math.max(
				...shapesOf(drawn, id).map((shape) =>
					Number(computedStyle(shape, drawn.rules, "light").get("stroke-width")),
				),
			);
		expect(widest("system")).toBeGreaterThan(widest("service"));

		for (const theme of ["light", "dark"] as const) {
			const standsOut = (id: string) => {
				const { fill, background } = fillAndBackground(drawn, id, theme);
				return contrast(fill, background);
			};
			expect(standsOut("system"), theme).toBeGreaterThan(standsOut("service"));
		}
	});
});
