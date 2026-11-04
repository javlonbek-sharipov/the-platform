import { describe, expect, test } from "vitest";
import {
	architecture,
	type Box,
	type Diagram,
	type Direction,
	render,
	type Scene,
	type SceneEdge,
	type SceneText,
} from "../src/index.ts";
import { advanceOf, bundledFont, characterMap, unitsPerEm } from "./support/truetype.ts";

const interRegular = bundledFont("Inter-Regular.ttf");
const regularCharacters = characterMap(interRegular);

/** A text's width in Inter Regular, read from the font file: its characters' advance widths, summed. */
function widthInInterRegular(text: string, size: number): number {
	let units = 0;
	for (const character of text) {
		const glyph = regularCharacters.get(character.codePointAt(0) ?? 0);
		if (glyph === undefined) {
			throw new Error(`Inter Regular has no ${character}`);
		}
		units += advanceOf(interRegular, glyph);
	}
	return (units * size) / unitsPerEm(interRegular);
}

const directions: Direction[] = ["right", "down"];

function sceneOf(diagram: unknown): Scene {
	const { scene, diagnostics } = render(diagram);
	expect(diagnostics).toEqual([]);
	if (scene === undefined) {
		throw new Error("expected a scene");
	}
	return scene;
}

function edgeOf(scene: Scene, id: string): SceneEdge {
	const edge = scene.edges.find((candidate) => candidate.id === id);
	if (edge === undefined) {
		throw new Error(`no Edge ${id} in the scene`);
	}
	return edge;
}

/** The box a text is drawn in, centered on its point, one font size high. */
function textBox(text: SceneText): Box {
	return {
		x: text.point.x - text.width / 2,
		y: text.point.y - text.size / 2,
		width: text.width,
		height: text.size,
	};
}

function contains(outer: Box, inner: Box): boolean {
	return (
		inner.x >= outer.x &&
		inner.y >= outer.y &&
		inner.x + inner.width <= outer.x + outer.width &&
		inner.y + inner.height <= outer.y + outer.height
	);
}

/**
 * The Orders API charges orders through the Payments API over gRPC, and
 * writes them to its database.
 */
function orders(direction: Direction): Diagram {
	return architecture({ title: "Orders", direction }, (d) => {
		const api = d.node({ id: "orders-api", kind: "service", title: "Orders API" });
		const payments = d.node({ id: "payments-api", kind: "service", title: "Payments API" });
		const db = d.node({ id: "orders-db", kind: "database", title: "Orders database" });
		d.edge(api, payments, {
			kind: "call",
			label: "Charges \n orders",
			technology: "grpc",
			rate: "2k/s",
		});
		d.edge(api, db, { kind: "call" });
	});
}

interface Stretch {
	horizontal: boolean;
	/** Its line: y for a horizontal stretch, x for a vertical one. */
	line: number;
	low: number;
	high: number;
}

/** Two lines closer than this are one. */
const sameLine = 0.5;

/**
 * Each run of a route, from corner to corner, or, `straight`, only its
 * straight part, between the arcs that round its corners.
 */
function runsOf(route: SceneEdge["route"], straight: boolean): Stretch[] {
	return route.slice(1).flatMap((to, index): Stretch[] => {
		const from = route[index];
		if (from === undefined) {
			return [];
		}
		const horizontal = from.y === to.y;
		const [a, b] = horizontal ? [from.x, to.x] : [from.y, to.y];
		const [lowEnd, highEnd] = a < b ? [from, to] : [to, from];
		return [
			{
				horizontal,
				line: horizontal ? from.y : from.x,
				low: Math.min(a, b) + (straight ? lowEnd.radius : 0),
				high: Math.max(a, b) - (straight ? highEnd.radius : 0),
			},
		];
	});
}

/**
 * The stretches of an Edge's route that belong to it alone, read from the
 * spec: each run's straight part, between the arcs that round its corners,
 * beyond the stubs of the Edge's two Ports, less every part that another
 * route runs along too.
 */
function ownStretches(scene: Scene, edge: SceneEdge): Stretch[] {
	const others = scene.edges
		.filter((other) => other !== edge)
		.flatMap(({ route }) => runsOf(route, false));
	const stubs = [edge.fromPort, edge.toPort];
	return runsOf(edge.route, true).flatMap((run) => {
		let pieces: [number, number][] = [[run.low, run.high]];
		const cut = (low: number, high: number) => {
			pieces = pieces.flatMap(([a, b]): [number, number][] =>
				high <= a || low >= b
					? [[a, b]]
					: [
							...(low > a ? [[a, low] as [number, number]] : []),
							...(high < b ? [[high, b] as [number, number]] : []),
						],
			);
		};
		for (const { point, stub } of stubs) {
			const along = run.horizontal ? [point.x, stub.x] : [point.y, stub.y];
			const across = run.horizontal ? point.y : point.x;
			const runsAlongStub = run.horizontal ? point.y === stub.y : point.x === stub.x;
			if (runsAlongStub && Math.abs(across - run.line) < sameLine) {
				cut(Math.min(...along), Math.max(...along));
			}
		}
		for (const other of others) {
			if (other.horizontal === run.horizontal && Math.abs(other.line - run.line) < sameLine) {
				cut(other.low, other.high);
			}
		}
		return pieces
			.filter(([low, high]) => high > low)
			.map(([low, high]) => ({ horizontal: run.horizontal, line: run.line, low, high }));
	});
}

/** The longest of an Edge's own stretches. */
function longestOwnStretch(scene: Scene, edge: SceneEdge): Stretch {
	const [longest] = ownStretches(scene, edge).sort((a, b) => b.high - b.low - (a.high - a.low));
	if (longest === undefined) {
		throw new Error(`${edge.id} has no stretch of its own`);
	}
	return longest;
}

/** Whether a box sits beside a stretch, a few pixels clear of its line, and centered along it. */
function besideStretch(box: Box, stretch: Stretch): boolean {
	const [near, far, start, size] = stretch.horizontal
		? [box.y, box.y + box.height, box.x, box.width]
		: [box.x, box.x + box.width, box.y, box.height];
	const gap = near > stretch.line ? near - stretch.line : stretch.line - far;
	const center = start + size / 2;
	return (
		gap > 0 &&
		gap <= 8 &&
		Math.abs(center - (stretch.low + stretch.high) / 2) < 0.01 &&
		start >= stretch.low &&
		start + size <= stretch.high
	);
}

describe("an Edge's label", () => {
	test.each(directions)(
		"shows its text, and below it its Technology by name and then its rate, laid out %s",
		(direction) => {
			const scene = sceneOf(orders(direction));
			const label = edgeOf(scene, "orders-api->payments-api").label;
			const { text, technology, rate } = label ?? {};
			if (
				label === undefined ||
				text === undefined ||
				technology === undefined ||
				rate === undefined
			) {
				throw new Error("expected a label with its text, Technology and rate");
			}

			// White space collapses, as in titles.
			expect([text.text, technology.text, rate.text]).toEqual(["Charges orders", "grpc", "2k/s"]);
			for (const each of [text, technology, rate]) {
				expect(each.weight).toBe("regular");
				expect(each.shortened).toBe(false);
				expect(each.width).toBeCloseTo(widthInInterRegular(each.text, each.size), 9);
				expect(contains(label.box, textBox(each)), each.text).toBe(true);
			}
			// The Technology and the rate share the line below the text, in a smaller size.
			expect(technology.point.y).toBe(rate.point.y);
			expect(technology.point.y - technology.size / 2).toBeGreaterThanOrEqual(
				text.point.y + text.size / 2,
			);
			expect(technology.size).toBeLessThan(text.size);
			expect(technology.point.x + technology.width / 2).toBeLessThan(rate.point.x - rate.width / 2);
			// An Edge with nothing to show has no label.
			expect(edgeOf(scene, "orders-api->orders-db").label).toBeUndefined();
		},
	);

	test.each(directions)(
		"sits centered beside its Edge's longest straight run, laid out %s",
		(direction) => {
			// The Orders API fans out to three stores, and the search index, the last of
			// them, lies off to the side, so its Edge bends twice on the way.
			const scene = sceneOf(
				architecture({ title: "Fan-out", direction }, (d) => {
					const api = d.node({ id: "orders-api", kind: "service", title: "Orders API" });
					for (const [id, kind] of [
						["orders-db", "database"],
						["orders-cache", "cache"],
						["orders-search", "search"],
					] as const) {
						d.node({ id, kind, title: id });
						d.edge(api, id, { kind: "call", ...(kind === "search" ? { label: "Indexes" } : {}) });
					}
				}),
			);
			const edge = edgeOf(scene, "orders-api->orders-search");
			expect(edge.route.length).toBeGreaterThan(2);
			expect(besideStretch(edge.label?.box ?? scene.bounds, longestOwnStretch(scene, edge))).toBe(
				true,
			);
		},
	);

	test("sits beside a run of its Edge's own, not beside a trunk it shares", () => {
		// The web and mobile apps both call the gateway, so their Edges merge into
		// one trunk before its Port. The web app's Edge runs straight, and the
		// mobile app's joins it from the side. (Laid out down, the mobile app's own
		// run across the rank is longer than the trunk, which tests nothing.)
		const scene = sceneOf(
			architecture({ title: "Trunk" }, (d) => {
				const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
				const mobile = d.node({ id: "mobile-app", kind: "client", title: "Mobile app" });
				const gateway = d.node({ id: "gateway", kind: "gateway", title: "Gateway" });
				d.edge(web, gateway, { kind: "call" });
				d.edge(mobile, gateway, { kind: "call", label: "Signs in" });
			}),
		);
		const edge = edgeOf(scene, "mobile-app->gateway");
		const longest = longestOwnStretch(scene, edge);
		// Its longest run, counting what it shares, is the trunk.
		const [longestRun] = runsOf(edge.route, true).sort((a, b) => b.high - b.low - (a.high - a.low));
		expect(longestRun && longestRun.high - longestRun.low).toBeGreaterThan(
			longest.high - longest.low,
		);
		expect(besideStretch(edge.label?.box ?? scene.bounds, longest)).toBe(true);
	});
});
