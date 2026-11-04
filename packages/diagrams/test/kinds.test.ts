import { describe, expect, test } from "vitest";
import {
	type ArchitectureNodeKind,
	architecture,
	architectureNodeKinds,
	architectureNodeLooks,
	type Box,
	type Direction,
} from "../src/index.ts";
import {
	draw,
	fillAndBackground,
	looksOf,
	nodeOf,
	paintsWithin,
	sceneOf,
	shapesOf,
	strokesOf,
} from "./support/drawn.ts";
import { computedStyle, contrast, type Point, runsOf } from "./support/svg.ts";

const directions: Direction[] = ["right", "down"];

/** One Node of each architecture Kind, with ids named after their Kinds, all with one title. */
function oneOfEach(title: string, direction: Direction = "right") {
	return architecture({ title: "Kinds", direction }, (d) => {
		for (const kind of architectureNodeKinds) {
			d.node({ id: kind, kind, title });
		}
	});
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

/** One Node of each Kind with each number of Rows, with ids like `queue-3`. */
function withRows(direction: Direction) {
	return architecture({ title: "Rows", direction }, (d) => {
		for (const count of [0, 1, 3]) {
			for (const kind of architectureNodeKinds) {
				const rows = Array.from({ length: count }, (_, at) => ({ name: `row ${at}`, value: "1" }));
				d.node({ id: `${kind}-${count}`, kind, title: "Shop", rows });
			}
		}
	});
}

/** How far a point is from the nearest stretch of any of the shapes' outlines. */
function distanceToShapes(point: Point, runs: Point[][]): number {
	let nearest = Number.POSITIVE_INFINITY;
	for (const run of runs) {
		run.forEach((a, index) => {
			const b = run[(index + 1) % run.length] ?? a;
			const [dx, dy] = [b.x - a.x, b.y - a.y];
			const length = dx * dx + dy * dy;
			const t =
				length === 0
					? 0
					: Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
			nearest = Math.min(nearest, Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)));
		});
	}
	return nearest;
}

describe("each Kind's outline, with Rows or without", () => {
	test.each(directions)("meets its Node's sides at each of its Ports, laid out %s", (direction) => {
		const drawn = draw(withRows(direction));
		for (const node of drawn.scene.nodes) {
			const outline = shapesOf(drawn, node.id).filter((shape) => {
				const style = computedStyle(shape, drawn.rules, "light");
				return style.get("stroke") !== "none" && !paintsWithin(drawn, shape, node.badge);
			});
			const runs = outline.flatMap(runsOf);
			const widest = Math.max(
				...outline.map((shape) =>
					Number(computedStyle(shape, drawn.rules, "light").get("stroke-width")),
				),
			);
			const ports = [
				node.input,
				node.output,
				...node.rows.flatMap((row) => [row.input, row.output]),
			];
			for (const { side, point } of ports) {
				// The stroke's outer edge reaches the Port, give or take half a pixel.
				expect(
					distanceToShapes(point, runs),
					`${node.id}, ${side} Port at ${point.y}`,
				).toBeLessThanOrEqual(widest / 2 + 0.5);
			}
		}
	});

	test.each(directions)("lies inside its Node's rectangle, laid out %s", (direction) => {
		const drawn = draw(withRows(direction));
		for (const node of drawn.scene.nodes) {
			for (const shape of shapesOf(drawn, node.id)) {
				expect(paintsWithin(drawn, shape, node.box), `${node.id}: <${shape.name}>`).toBe(true);
			}
		}
	});
});
