import { describe, expect, test } from "vitest";
import example from "../docs/example-system.diagram.ts";
import { architecture, type Point, type SceneEdge, type Side } from "../src/index.ts";
import { crowded } from "./fixtures/crowded.ts";
import orderFlow from "./fixtures/edges.ts";
import { draw, edgeGroupOf, linesOf, sceneOf, strokeOf } from "./support/drawn.ts";
import { everyFixture } from "./support/fixtures.ts";
import {
	colorUnder,
	computedStyle,
	contrast,
	descendants,
	fillContains,
	isShape,
	luminance,
	paintedBounds,
	parseColor,
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

/** The point a distance along a route from its source, if the route is that long. */
function pointAlong(route: Point[], distance: number): Point | undefined {
	let start = 0;
	for (let index = 1; index < route.length; index += 1) {
		const from = route[index - 1];
		const to = route[index];
		if (from === undefined || to === undefined) {
			break;
		}
		const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
		if (distance <= start + length) {
			const along = distance - start;
			return {
				x: from.x + Math.sign(to.x - from.x) * along,
				y: from.y + Math.sign(to.y - from.y) * along,
			};
		}
		start += length;
	}
	return undefined;
}

/** How far along a route from its source a point on it lies, the first time the route reaches it. */
function distanceAlong(route: Point[], point: Point): number | undefined {
	let start = 0;
	for (let index = 1; index < route.length; index += 1) {
		const from = route[index - 1];
		const to = route[index];
		if (from === undefined || to === undefined) {
			break;
		}
		const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
		const along = Math.abs(point.x - from.x) + Math.abs(point.y - from.y);
		const onRun =
			Math.min(from.x, to.x) <= point.x &&
			point.x <= Math.max(from.x, to.x) &&
			Math.min(from.y, to.y) <= point.y &&
			point.y <= Math.max(from.y, to.y);
		if (onRun) {
			return start + along;
		}
		start += length;
	}
	return undefined;
}

/**
 * Whether two routes from one Port part at a point: walking both from the
 * Port, half a pixel at a time, they stay together as far as the point, and
 * a step past it they're apart.
 */
function partAt(a: Point[], b: Point[], point: Point): boolean {
	const distance = distanceAlong(a, point);
	if (distance === undefined || distanceAlong(b, point) !== distance) {
		return false;
	}
	const apart = (t: number) => {
		const [onA, onB] = [pointAlong(a, t), pointAlong(b, t)];
		return (
			onA === undefined || onB === undefined || Math.hypot(onA.x - onB.x, onA.y - onB.y) > 0.01
		);
	};
	for (let t = 0; t < distance; t += 0.5) {
		if (apart(t)) {
			return false;
		}
	}
	return !apart(distance) && apart(distance + 0.5);
}

describe("a Port that feeds two or more Edges", () => {
	test("has a junction wherever their routes part, and there's no junction anywhere else", () => {
		let seen = 0;
		for (const [name, diagram] of fixtures) {
			const scene = sceneOf(diagram);
			const feeding = new Map<string, SceneEdge[]>();
			for (const edge of scene.edges) {
				const port = JSON.stringify([edge.from, edge.fromRow ?? null]);
				feeding.set(port, [...(feeding.get(port) ?? []), edge]);
			}
			const portOf = (junction: (typeof scene.junctions)[number]) =>
				JSON.stringify([junction.node, junction.row ?? null]);
			for (const junction of scene.junctions) {
				expect(
					feeding.get(portOf(junction))?.length ?? 0,
					`${name}: ${portOf(junction)}`,
				).toBeGreaterThan(1);
			}
			for (const [port, edges] of feeding) {
				const junctions = scene.junctions.filter((junction) => portOf(junction) === port);
				const pairs = edges.flatMap((a, index) =>
					edges.slice(index + 1).map((b) => [a, b] as const),
				);
				for (const [a, b] of pairs) {
					expect(
						junctions.filter((junction) => partAt(a.route, b.route, junction.point)),
						`${name}: ${a.id} and ${b.id}`,
					).toHaveLength(1);
					seen += 1;
				}
				for (const junction of junctions) {
					expect(
						pairs.some(([a, b]) => partAt(a.route, b.route, junction.point)),
						`${name}: ${port} at (${junction.point.x}, ${junction.point.y})`,
					).toBe(true);
				}
			}
		}
		expect(seen).toBeGreaterThan(20);
	});

	test("draws a mark over each junction, above every Edge, in their color, wider than their lines", () => {
		for (const diagram of [example, orderFlow, crowded()]) {
			const drawn = draw(diagram);
			const all = descendants(drawn.root);
			const lastEdge = Math.max(
				...all.map((element, index) => (element.attributes.has("data-edge") ? index : -1)),
			);
			const marks = all.filter(
				(element) => isShape(element) && element.attributes.has("data-from"),
			);
			expect(marks).toHaveLength(drawn.scene.junctions.length);
			expect(drawn.scene.junctions.length).toBeGreaterThan(0);
			for (const junction of drawn.scene.junctions) {
				const mark = marks.find(
					(candidate) =>
						candidate.attributes.get("data-from") === junction.node &&
						candidate.attributes.get("data-from-row") === junction.row &&
						fillContains(candidate, junction.point),
				);
				expect(
					mark,
					`${junction.node} at (${junction.point.x}, ${junction.point.y})`,
				).toBeDefined();
				if (mark === undefined) {
					continue;
				}
				expect(all.indexOf(mark)).toBeGreaterThan(lastEdge);
				const painted = paintedBounds(mark, drawn.rules, "light");
				const middle = {
					x: (painted.left + painted.right) / 2,
					y: (painted.top + painted.bottom) / 2,
				};
				expect(Math.hypot(middle.x - junction.point.x, middle.y - junction.point.y)).toBeLessThan(
					0.01,
				);
				const edges = drawn.scene.edges.filter(
					(edge) => edge.from === junction.node && edge.fromRow === junction.row,
				);
				const [first] = edges;
				const [casing] = first === undefined ? [] : linesOf(drawn, first);
				expect(casing).toBeDefined();
				expect(painted.right - painted.left).toBeGreaterThan(
					strokeOf(drawn, casing ?? mark, "light").width,
				);
				for (const theme of themes) {
					const bodies = edges.map((edge) =>
						computedStyle(linesOf(drawn, edge, theme)[1] ?? mark, drawn.rules, theme).get("stroke"),
					);
					expect(bodies).toContain(computedStyle(mark, drawn.rules, theme).get("fill"));
				}
			}
		}
	});
});

describe("an Edge between regions or zones", () => {
	test("crosses them when its ends sit in different region Groups, or different zone Groups", () => {
		const crossing = (diagram: unknown) =>
			Object.fromEntries(sceneOf(diagram).edges.map((edge) => [edge.id, edge.crosses?.kind]));
		// The web app sits in no region, and the Mailer in its region but in no zone.
		expect(crossing(orderFlow)).toEqual({
			"web-app->orders-api": undefined,
			"orders-api->orders-db": undefined,
			"orders-api->order-events": undefined,
			"orders-api->stock-api": "zone",
			"order-events->mailer": undefined,
			"order-events->analytics": "region",
		});
		// Zones in different regions: the Edge crosses regions.
		const zonesApart = architecture({ title: "Zones apart" }, (d) => {
			for (const region of ["eu", "us"]) {
				d.group({ id: `${region}-west`, kind: "region", title: region }, (west) => {
					west.group({ id: `${region}-west-a`, kind: "zone", title: "a" }, (zone) => {
						zone.node({ id: `${region}-api`, kind: "service", title: `${region} API` });
					});
				});
			}
			d.edge("eu-api", "us-api", { kind: "call" });
			d.edge("us-api", "eu-api", { kind: "message" });
		});
		expect(crossing(zonesApart)).toEqual({
			"eu-api->us-api": "region",
			"us-api->eu-api": "region",
		});
		// A system isn't a region or a zone, and a Node outside every Group is in neither.
		const systems = architecture({ title: "Systems" }, (d) => {
			const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
			for (const name of ["orders", "stock"]) {
				d.group({ id: name, kind: "system", title: name }, (system) => {
					const api = system.node({ id: `${name}-api`, kind: "service", title: `${name} API` });
					d.edge(web, api, { kind: "call" });
				});
			}
			d.edge("orders-api", "stock-api", { kind: "call" });
		});
		expect(Object.values(crossing(systems))).toEqual([undefined, undefined, undefined]);
	});

	test("has its badge in the middle of the stretch of its route that it shares with no other Edge", () => {
		const length = (route: Point[]) =>
			route.slice(1).reduce((total, to, index) => {
				const from = route[index] ?? to;
				return total + Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
			}, 0);
		/** How far two routes from one point run together, walking both half a pixel at a time. */
		const together = (a: Point[], b: Point[]) => {
			for (let t = 0; ; t += 0.5) {
				const [onA, onB] = [pointAlong(a, t), pointAlong(b, t)];
				if (
					onA === undefined ||
					onB === undefined ||
					Math.hypot(onA.x - onB.x, onA.y - onB.y) > 0.01
				) {
					return t - 0.5;
				}
			}
		};
		let seen = 0;
		for (const [name, diagram] of fixtures) {
			const { edges } = sceneOf(diagram);
			for (const edge of edges) {
				if (edge.crosses === undefined) {
					continue;
				}
				seen += 1;
				const stub = (port: SceneEdge["fromPort"]) => length([port.point, port.stub]);
				const out = Math.max(
					stub(edge.fromPort),
					...edges
						.filter(
							(other) =>
								other !== edge && other.from === edge.from && other.fromRow === edge.fromRow,
						)
						.map((other) => together(edge.route, other.route)),
				);
				const into = Math.max(
					stub(edge.toPort),
					...edges
						.filter((other) => other !== edge && other.to === edge.to && other.toRow === edge.toRow)
						.map((other) => together([...edge.route].reverse(), [...other.route].reverse())),
				);
				const total = length(edge.route);
				const middle = out < total - into ? (out + total - into) / 2 : total / 2;
				const at = distanceAlong(edge.route, edge.crosses.badge);
				expect(at, `${name}: ${edge.id}`).toBeDefined();
				expect(Math.abs((at ?? 0) - middle), `${name}: ${edge.id}`).toBeLessThanOrEqual(1);
			}
		}
		expect(seen).toBeGreaterThan(5);
	});

	test("goes beneath an Edge that doesn't cross, wherever they share a stretch, so that stretch looks plain", () => {
		let seen = 0;
		for (const [name, diagram] of fixtures) {
			const drawn = draw(diagram);
			const order = descendants(drawn.root);
			for (const edge of drawn.scene.edges.filter((candidate) => candidate.crosses !== undefined)) {
				for (const other of drawn.scene.edges.filter(
					(candidate) => candidate.crosses === undefined,
				)) {
					const shares =
						(edge.from === other.from && edge.fromRow === other.fromRow) ||
						(edge.to === other.to && edge.toRow === other.toRow);
					if (shares) {
						seen += 1;
						expect(
							order.indexOf(edgeGroupOf(drawn, edge.id)),
							`${name}: ${edge.id} and ${other.id}`,
						).toBeLessThan(order.indexOf(edgeGroupOf(drawn, other.id)));
					}
				}
			}
		}
		expect(seen).toBeGreaterThan(5);
	});

	test("is drawn in the warning color, with a badge at its middle that says so, in both themes", () => {
		// The theme's warning color, in which a degraded status is drawn too.
		const warning: Record<Theme, string> = { light: "#9a6700", dark: "#d29922" };
		for (const diagram of [orderFlow, crowded()]) {
			const drawn = draw(diagram);
			const crossing = drawn.scene.edges.filter((edge) => edge.crosses !== undefined);
			expect(crossing.length).toBeGreaterThan(0);
			for (const edge of drawn.scene.edges) {
				const group = edgeGroupOf(drawn, edge.id);
				expect(group.attributes.get("data-crosses"), edge.id).toBe(edge.crosses?.kind);
				for (const theme of themes) {
					const [, body] = linesOf(drawn, edge, theme);
					const color = computedStyle(body ?? group, drawn.rules, theme).get("stroke");
					expect(color === warning[theme], `${edge.id}, ${theme}`).toBe(edge.crosses !== undefined);
				}
				if (edge.crosses === undefined) {
					continue;
				}
				const { badge } = edge.crosses;
				const shapes = descendants(group).filter(isShape);
				const disc = shapes.find(
					(shape) =>
						computedStyle(shape, drawn.rules, "light").get("fill") !== "none" &&
						fillContains(shape, badge),
				);
				expect(disc, edge.id).toBeDefined();
				if (disc === undefined) {
					continue;
				}
				const painted = paintedBounds(disc, drawn.rules, "light");
				expect(painted.right - painted.left, edge.id).toBeGreaterThanOrEqual(12);
				expect((painted.left + painted.right) / 2, edge.id).toBeCloseTo(badge.x, 2);
				expect((painted.top + painted.bottom) / 2, edge.id).toBeCloseTo(badge.y, 2);
				// A glyph on it, painted after it and inside it.
				const glyph = shapes.slice(shapes.indexOf(disc) + 1).filter((shape) => {
					const bounds = paintedBounds(shape, drawn.rules, "light");
					return (
						bounds.left >= painted.left &&
						bounds.right <= painted.right &&
						bounds.top >= painted.top &&
						bounds.bottom <= painted.bottom
					);
				});
				expect(glyph.length, edge.id).toBeGreaterThan(0);
				for (const theme of themes) {
					const fill = parseColor(computedStyle(disc, drawn.rules, theme).get("fill") ?? "");
					expect(computedStyle(disc, drawn.rules, theme).get("fill"), edge.id).toBe(warning[theme]);
					for (const shape of glyph) {
						const ink = parseColor(computedStyle(shape, drawn.rules, theme).get("stroke") ?? "");
						expect(
							contrast(ink ?? [0, 0, 0], fill ?? [0, 0, 0]),
							`${edge.id}, ${theme}`,
						).toBeGreaterThanOrEqual(3);
					}
				}
			}
		}
	});
});
