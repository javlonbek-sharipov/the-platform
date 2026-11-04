import { describe, expect, test } from "vitest";
import example from "../docs/example-system.diagram.ts";
import type { Point, SceneEdge, Side } from "../src/index.ts";
import orderFlow from "./fixtures/edges.ts";
import { draw, edgeGroupOf, linesOf, sceneOf, strokeOf } from "./support/drawn.ts";
import { everyFixture } from "./support/fixtures.ts";
import {
	colorUnder,
	computedStyle,
	contrast,
	descendants,
	isShape,
	luminance,
	runsOf,
	type Theme,
} from "./support/svg.ts";

const themes: Theme[] = ["light", "dark"];
const fixtures = await everyFixture();

describe("an Edge's line", () => {
	test("is solid for a call and dashed for a message, in both themes", () => {
		const drawn = draw(orderFlow);
		const kinds = new Set(drawn.scene.edges.map((edge) => edge.kind));
		expect([...kinds].sort()).toEqual(["call", "message"]);
		for (const theme of themes) {
			for (const edge of drawn.scene.edges) {
				const lines = linesOf(drawn, edge, theme);
				expect(lines.length, edge.id).toBeGreaterThan(0);
				for (const line of lines) {
					const { dashes } = strokeOf(drawn, line, theme);
					expect(dashes === "none", `${edge.id}, ${theme}`).toBe(edge.kind === "call");
				}
			}
		}
	});

	test("is a body inside a wider, darker casing, which stands out from the background, in both themes", () => {
		for (const [name, diagram] of fixtures) {
			const drawn = draw(diagram);
			const { bounds } = drawn.scene;
			const corner = { x: bounds.x + 1, y: bounds.y + 1 };
			const first = descendants(drawn.root).find((element) => element.attributes.has("data-edge"));
			for (const theme of themes) {
				const background = colorUnder(drawn.root, first ?? drawn.root, corner, drawn.rules, theme);
				for (const edge of drawn.scene.edges) {
					const lines = linesOf(drawn, edge, theme);
					expect(lines, `${name}: ${edge.id}`).toHaveLength(2);
					const [casing, body] = lines.map((line) => strokeOf(drawn, line, theme));
					if (casing === undefined || body === undefined) {
						continue;
					}
					expect(casing.width, `${name}: ${edge.id}`).toBeGreaterThan(body.width + 1);
					expect(luminance(casing.color), `${name}: ${edge.id}, ${theme}`).toBeLessThan(
						luminance(body.color),
					);
					expect(casing.dashes, `${name}: ${edge.id}`).toBe(body.dashes);
					expect(
						Math.max(contrast(casing.color, background), contrast(body.color, background)),
						`${name}: ${edge.id}, ${theme}`,
					).toBeGreaterThanOrEqual(3);
				}
			}
		}
	});
});

/** The unit vector that points into a Node through one of its sides. */
const inward: Record<Side, Point> = {
	left: { x: 1, y: 0 },
	right: { x: -1, y: 0 },
	top: { x: 0, y: 1 },
	bottom: { x: 0, y: -1 },
};

describe("an Edge's arrowhead", () => {
	test("sits at its target, pointing into the Node, wider than its line and in its color, in every fixture", () => {
		for (const [name, diagram] of fixtures) {
			const drawn = draw(diagram);
			for (const edge of drawn.scene.edges) {
				const { point, side } = edge.toPort;
				const into = inward[side];
				/** How far a point lies ahead of the Port, into the Node, and how far to one side. */
				const ahead = (at: Point) => (at.x - point.x) * into.x + (at.y - point.y) * into.y;
				const aside = (at: Point) => (at.x - point.x) * into.y - (at.y - point.y) * into.x;
				const heads = descendants(edgeGroupOf(drawn, edge.id)).filter(
					(shape) =>
						isShape(shape) &&
						computedStyle(shape, drawn.rules, "light").get("fill") !== "none" &&
						runsOf(shape)
							.flat()
							.every((at) => ahead(at) <= 0.01 && ahead(at) >= -16 && Math.abs(aside(at)) <= 8),
				);
				expect(heads, `${name}: ${edge.id}`).toHaveLength(1);
				const [head] = heads;
				const [casing] = linesOf(drawn, edge);
				if (head === undefined || casing === undefined) {
					continue;
				}
				const points = runsOf(head).flat();
				// Its tip touches the Node's side, on the line, and it widens behind the tip.
				const tip = points.filter((at) => ahead(at) > -0.5);
				expect(tip.length, `${name}: ${edge.id}`).toBeGreaterThan(0);
				expect(
					Math.max(...tip.map((at) => Math.abs(aside(at)))),
					`${name}: ${edge.id}`,
				).toBeLessThan(0.5);
				const width = Math.max(...points.map(aside)) - Math.min(...points.map(aside));
				expect(width, `${name}: ${edge.id}`).toBeGreaterThan(
					strokeOf(drawn, casing, "light").width,
				);
				for (const theme of themes) {
					const [, body] = linesOf(drawn, edge, theme);
					expect(computedStyle(head, drawn.rules, theme).get("fill"), `${name}: ${edge.id}`).toBe(
						computedStyle(body ?? head, drawn.rules, theme).get("stroke"),
					);
				}
			}
		}
	});
});

/** A run of a route: its two ends, and the radii of the corners at them. */
interface Run {
	from: Point;
	to: Point;
	/** How far it runs before it, from the route's source. */
	start: number;
	length: number;
	radii: [number, number];
}

function runsOfRoute(route: SceneEdge["route"]): Run[] {
	let start = 0;
	return route.slice(1).flatMap((to, index) => {
		const from = route[index];
		if (from === undefined) {
			return [];
		}
		const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
		const run: Run = { from, to, start, length, radii: [from.radius, to.radius] };
		start += length;
		return [run];
	});
}

/** The run of a route that a point lies on, strictly between its corners' arcs, and how far along it. */
function runAt(route: SceneEdge["route"], point: Point): { run: Run; along: number } | undefined {
	for (const run of runsOfRoute(route)) {
		const along = Math.abs(point.x - run.from.x) + Math.abs(point.y - run.from.y);
		const onLine =
			(run.from.x === run.to.x && point.x === run.from.x) ||
			(run.from.y === run.to.y && point.y === run.from.y);
		if (onLine && along > run.radii[0] && along < run.length - run.radii[1]) {
			const between =
				Math.min(run.from.x, run.to.x) <= point.x &&
				point.x <= Math.max(run.from.x, run.to.x) &&
				Math.min(run.from.y, run.to.y) <= point.y &&
				point.y <= Math.max(run.from.y, run.to.y);
			if (between) {
				return { run, along };
			}
		}
	}
	return undefined;
}

describe("an Edge's chevrons", () => {
	test("sit on straight stretches of its route, clear of its corners, pointing toward its target", () => {
		for (const [name, diagram] of fixtures) {
			for (const edge of sceneOf(diagram).edges) {
				for (const chevron of edge.chevrons) {
					const at = runAt(edge.route, chevron.point);
					expect(
						at,
						`${name}: ${edge.id} at (${chevron.point.x}, ${chevron.point.y})`,
					).toBeDefined();
					if (at === undefined) {
						continue;
					}
					const { from, to } = at.run;
					expect(chevron.heading, `${name}: ${edge.id}`).toEqual({
						x: Math.sign(to.x - from.x),
						y: Math.sign(to.y - from.y),
					});
				}
			}
		}
	});

	test("are drawn by both of two Edges wherever they share a stretch, so a trunk shows one set", () => {
		for (const [name, diagram] of fixtures) {
			const { edges } = sceneOf(diagram);
			for (const edge of edges) {
				for (const other of edges.filter((candidate) => candidate !== edge)) {
					for (const chevron of edge.chevrons) {
						const at = runAt(other.route, chevron.point);
						if (at === undefined) {
							continue;
						}
						const { from, to } = at.run;
						const runsAlong =
							Math.sign(to.x - from.x) === chevron.heading.x &&
							Math.sign(to.y - from.y) === chevron.heading.y;
						if (runsAlong) {
							expect(other.chevrons, `${name}: ${edge.id} and ${other.id}`).toContainEqual(chevron);
						}
					}
				}
			}
		}
	});

	test("sit whole spacings apart along a route, one spacing for every Edge", () => {
		/** How far back from the target, along the route, a point on it lies. */
		const backOf = (edge: SceneEdge, point: Point) => {
			const at = runAt(edge.route, point);
			const length = runsOfRoute(edge.route).reduce((total, run) => total + run.length, 0);
			return at === undefined ? Number.NaN : length - at.run.start - at.along;
		};
		const gaps = fixtures.flatMap(([, diagram]) =>
			sceneOf(diagram).edges.flatMap((edge) =>
				edge.chevrons.slice(1).map((chevron, index) => {
					const before = edge.chevrons[index];
					return before === undefined
						? 0
						: backOf(edge, chevron.point) - backOf(edge, before.point);
				}),
			),
		);
		expect(gaps.length).toBeGreaterThan(100);
		const spacing = Math.min(...gaps);
		expect(spacing).toBeGreaterThanOrEqual(32);
		for (const gap of gaps) {
			const spacings = gap / spacing;
			expect(Math.abs(spacings - Math.round(spacings)), String(gap)).toBeLessThan(1e-6);
		}
	});

	test("are each drawn as a mark in the line's color, pointing the way it heads, wider than the line", () => {
		for (const diagram of [example, orderFlow]) {
			const drawn = draw(diagram);
			for (const edge of drawn.scene.edges) {
				const lines = linesOf(drawn, edge);
				const [casing, body] = lines.map((line) => strokeOf(drawn, line, "light"));
				const color = computedStyle(lines[1] ?? drawn.root, drawn.rules, "light").get("stroke");
				// Each stroked run of three points, in the body's color, that isn't the line itself.
				const marks = descendants(edgeGroupOf(drawn, edge.id))
					.filter(
						(shape) =>
							isShape(shape) &&
							!lines.includes(shape) &&
							computedStyle(shape, drawn.rules, "light").get("fill") === "none" &&
							computedStyle(shape, drawn.rules, "light").get("stroke") === color,
					)
					.flatMap((shape) => runsOf(shape));
				expect(marks, edge.id).toHaveLength(edge.chevrons.length);
				for (const { point, heading } of edge.chevrons) {
					const ahead = (at: Point) => (at.x - point.x) * heading.x + (at.y - point.y) * heading.y;
					const aside = (at: Point) => (at.x - point.x) * heading.y - (at.y - point.y) * heading.x;
					const mark = marks.find(
						(run) =>
							run.length === 3 &&
							run.every((at) => Math.hypot(at.x - point.x, at.y - point.y) <= 6),
					);
					expect(mark, `${edge.id} at (${point.x}, ${point.y})`).toBeDefined();
					const [one, tip, other] = mark ?? [];
					if (one === undefined || tip === undefined || other === undefined) {
						continue;
					}
					expect(ahead(tip), edge.id).toBeGreaterThan(Math.max(ahead(one), ahead(other)));
					expect(Math.abs(aside(tip)), edge.id).toBeLessThan(0.01);
					expect(aside(one) * aside(other), edge.id).toBeLessThan(0);
					const reach = (casing?.width ?? 0) / 2;
					expect(Math.min(Math.abs(aside(one)), Math.abs(aside(other))), edge.id).toBeGreaterThan(
						reach + (body?.width ?? 0) / 2,
					);
				}
			}
		}
	});

	test("show the direction of every Edge in the example and the order flow", () => {
		for (const diagram of [example, orderFlow]) {
			for (const edge of sceneOf(diagram).edges) {
				expect(edge.chevrons.length, edge.id).toBeGreaterThan(0);
			}
		}
	});
});
