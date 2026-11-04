import { describe, expect, test } from "vitest";
import {
	architecture,
	type Box,
	type Diagram,
	type Direction,
	type Point,
	render,
	type Scene,
	type SceneEdge,
	type SceneText,
} from "../src/index.ts";
import { crowded } from "./fixtures/crowded.ts";
import { groupFixtures } from "./fixtures/groups.ts";
import { computedStyle, descendants, type Element, parseSvg, rulesOf } from "./support/svg.ts";
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
 * route runs along too. A run that crosses a Group's border makes a stretch
 * on each side of it, so that a label centered on one doesn't sit across the
 * border.
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
		for (const { box } of scene.groups) {
			const [near, far, sides] = run.horizontal
				? [box.y, box.y + box.height, [box.x, box.x + box.width]]
				: [box.x, box.x + box.width, [box.y, box.y + box.height]];
			if (near < run.line && run.line < far) {
				for (const side of sides) {
					pieces = pieces.flatMap(([a, b]): [number, number][] =>
						a < side && side < b
							? [
									[a, side],
									[side, b],
								]
							: [[a, b]],
					);
				}
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

/** web-app → shop-api → shop-db, with a label on the first Edge. */
function chain(direction: Direction, label: string): Diagram {
	return architecture({ title: "Chain", direction }, (d) => {
		const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
		const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
		const db = d.node({ id: "shop-db", kind: "database", title: "Shop database" });
		d.edge(web, api, { kind: "call", label });
		d.edge(api, db, { kind: "call" });
	});
}

/** A box's start and end along an axis. */
function span(box: Box, axis: "x" | "y"): [number, number] {
	return axis === "x" ? [box.x, box.x + box.width] : [box.y, box.y + box.height];
}

/**
 * A Diagram with a label on every `every`th Edge, of a few lengths, some with
 * a Technology or a rate below it.
 */
function labeled(diagram: Diagram, every = 1): Diagram {
	const phrases = ["Reads", "Places orders", "Publishes events", "Syncs stock", "Charges cards"];
	return {
		...diagram,
		edges: diagram.edges.map((edge, index) =>
			index % every !== 0
				? edge
				: {
						...edge,
						label: phrases[(index / every) % phrases.length] ?? "Reads",
						...(index % 3 === 0 ? { technology: "grpc" } : {}),
						...(index % 4 === 1 ? { rate: "2k/s" } : {}),
					},
		),
	};
}

/** The Orders API calls five stores, each labeled. */
function stores(direction: Direction): Diagram {
	return labeled(
		architecture({ title: "Stores", direction }, (d) => {
			const api = d.node({ id: "orders-api", kind: "service", title: "Orders API" });
			for (const [id, kind] of [
				["orders-db", "database"],
				["orders-cache", "cache"],
				["order-events", "queue"],
				["orders-search", "search"],
				["invoices", "storage"],
			] as const) {
				d.node({ id, kind, title: id });
				d.edge(api, id, { kind: kind === "queue" ? "message" : "call" });
			}
		}),
	);
}

const labeledFixtures: [string, (direction: Direction) => Diagram][] = [
	["orders", orders],
	["a fan-out to five stores", stores],
	...groupFixtures.map(([name, fixture]): [string, (direction: Direction) => Diagram] => [
		name,
		(direction) => labeled(fixture(direction)),
	]),
	[
		"the crowded fixture, with every sixth Edge labeled",
		(direction) => labeled(crowded(direction), 6),
	],
];

function overlaps(a: Box, b: Box): boolean {
	return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Whether a horizontal or vertical segment passes through a box, inside its border. */
function crosses(box: Box, a: Point, b: Point): boolean {
	const inside = 1e-6;
	return (
		Math.min(a.x, b.x) < box.x + box.width - inside &&
		Math.max(a.x, b.x) > box.x + inside &&
		Math.min(a.y, b.y) < box.y + box.height - inside &&
		Math.max(a.y, b.y) > box.y + inside
	);
}

function grown(box: Box, by: number): Box {
	return { x: box.x - by, y: box.y - by, width: box.width + 2 * by, height: box.height + 2 * by };
}

/**
 * What a label's box would cover that labels stay clear of: Nodes, callouts'
 * tags, the stubs of the Ports that Edges use, Group labels, and the boxes of
 * the other labels.
 */
function coveredBy(scene: Scene, box: Box, edge: SceneEdge): string[] {
	const stubs = new Map(
		scene.edges.flatMap(({ fromPort, toPort }) =>
			[fromPort, toPort].map((port) => [`${port.point.x} ${port.point.y}`, port] as const),
		),
	);
	return [
		...scene.nodes.flatMap(({ id, box: node, callout }) => [
			...(overlaps(box, node) ? [`Node ${id}`] : []),
			...(callout !== undefined && overlaps(box, callout.tag) ? [`${id}'s tag`] : []),
		]),
		...[...stubs.values()].flatMap(({ point, stub }) =>
			crosses(box, point, stub) ? [`the stub at (${point.x}, ${point.y})`] : [],
		),
		...scene.groups.flatMap(({ id, label }) => (overlaps(box, label) ? [`${id}'s label`] : [])),
		...scene.edges.flatMap(({ id, label }) =>
			id !== edge.id && label !== undefined && overlaps(box, label.box) ? [`${id}'s label`] : [],
		),
	];
}

/** The routes and Group borders that pass through a box. */
function linesThrough(scene: Scene, box: Box): string[] {
	return [
		...scene.edges.flatMap(({ id, route }) =>
			route.slice(1).some((to, index) => crosses(box, route[index] ?? to, to)) ? [id] : [],
		),
		...scene.groups.flatMap(({ id, box: group }) => {
			const corners = [
				{ x: group.x, y: group.y },
				{ x: group.x + group.width, y: group.y },
				{ x: group.x + group.width, y: group.y + group.height },
				{ x: group.x, y: group.y + group.height },
			];
			return corners.some((corner, index) =>
				crosses(box, corner, corners[(index + 1) % 4] ?? corner),
			)
				? [`${id}'s border`]
				: [];
		}),
	];
}

/** How far a box sits from a stretch's line, if it sits beside the stretch, centered along it. */
function gapBeside(box: Box, stretch: Stretch): number | undefined {
	return besideStretch(box, stretch)
		? stretch.horizontal
			? Math.max(box.y - stretch.line, stretch.line - (box.y + box.height))
			: Math.max(box.x - stretch.line, stretch.line - (box.x + box.width))
		: undefined;
}

/** A box of a given size beside a stretch, centered along it, on one side, `gap` clear of its line. */
function besideAt(stretch: Stretch, size: Box, gap: number, side: -1 | 1): Box {
	const middle = (stretch.low + stretch.high) / 2;
	return stretch.horizontal
		? {
				...size,
				x: middle - size.width / 2,
				y: side < 0 ? stretch.line - gap - size.height : stretch.line + gap,
			}
		: {
				...size,
				x: side < 0 ? stretch.line - gap - size.width : stretch.line + gap,
				y: middle - size.height / 2,
			};
}

describe.each(directions)("the labels in each fixture, laid out %s", (direction) => {
	describe.each(labeledFixtures)("%s", (_, fixture) => {
		const diagram = fixture(direction);
		const { scene, diagnostics } = render(diagram);
		if (scene === undefined) {
			throw new Error("expected a scene");
		}
		/** The Edges whose labels went to the route's midpoint, as warnings say. */
		const fellBack = new Set(
			diagnostics
				.filter(({ rule }) => rule === "label-placement")
				.map(({ pointer }) => diagram.edges[Number(pointer?.split("/")[2])]?.id),
		);
		const placed = scene.edges.filter(({ id, label }) => label !== undefined && !fellBack.has(id));

		test("raise no errors, and place some labels", () => {
			expect(diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
			expect(placed.length).toBeGreaterThan(0);
		});

		test("send a label to its route's midpoint only when no run of its Edge's own holds it in full, clear of everything", () => {
			const { gap, margin } = scene.labelSpacing;
			for (const edge of scene.edges.filter(({ id }) => fellBack.has(id))) {
				const box = edge.label?.box ?? scene.bounds;
				for (const stretch of ownStretches(scene, edge)) {
					for (const side of [-1, 1] as const) {
						const candidate = besideAt(stretch, box, gap, side);
						const extent = stretch.horizontal ? candidate.width : candidate.height;
						if (extent <= stretch.high - stretch.low) {
							expect(
								coveredBy(scene, grown(candidate, margin), edge).length,
								`${edge.id} could sit beside its run on ${stretch.horizontal ? "y" : "x"} = ${stretch.line}`,
							).toBeGreaterThan(0);
						}
					}
				}
			}
		});

		test("stay clear of every Node, tag, Port stub, Group label and other label", () => {
			for (const edge of placed) {
				expect(coveredBy(scene, edge.label?.box ?? scene.bounds, edge), edge.id).toEqual([]);
			}
		});

		test("each sit beside a straight run of their own Edge's, centered along it", () => {
			for (const edge of placed) {
				const box = edge.label?.box ?? scene.bounds;
				expect(
					ownStretches(scene, edge).some((stretch) => besideStretch(box, stretch)),
					edge.id,
				).toBe(true);
			}
		});

		test("sit beside a shorter run only where every longer run of their Edge's is taken", () => {
			const { margin } = scene.labelSpacing;
			for (const edge of placed) {
				const box = edge.label?.box ?? scene.bounds;
				if (
					[edge.label?.text, edge.label?.technology, edge.label?.rate].some(
						(text) => text?.shortened,
					)
				) {
					continue;
				}
				const stretches = ownStretches(scene, edge);
				const at = stretches
					.filter((stretch) => gapBeside(box, stretch) !== undefined)
					.sort((a, b) => b.high - b.low - (a.high - a.low))[0];
				const gap = at === undefined ? undefined : gapBeside(box, at);
				if (at === undefined || gap === undefined) {
					throw new Error(`${edge.id}'s label isn't beside a run of its own`);
				}
				// A label that covers a route or a Group's border found no place clear of them.
				const coversLines = linesThrough(scene, box).length > 0;
				for (const other of stretches) {
					const longer = other.high - other.low > at.high - at.low + 0.5;
					if (!longer && !coversLines) {
						continue;
					}
					for (const side of [-1, 1] as const) {
						const candidate = besideAt(other, box, gap, side);
						const extent = other.horizontal ? candidate.width : candidate.height;
						if (
							extent > other.high - other.low ||
							(candidate.x === box.x && candidate.y === box.y)
						) {
							continue;
						}
						const hard = coveredBy(scene, grown(candidate, margin), edge);
						const lines = linesThrough(scene, candidate);
						expect(
							longer
								? hard.length > 0 || (!coversLines && lines.length > 0)
								: hard.length + lines.length > 0,
							`${edge.id} could sit beside its run on ${other.horizontal ? "y" : "x"} = ${other.line}`,
						).toBe(true);
					}
				}
			}
		});
	});
});

describe("an Edge's label with no room on a run of its own", () => {
	/**
	 * The web app and the admin app both call the gateway. The admin app's Edge
	 * is routed first, by id, and the web app's joins its trunk at the end of
	 * its own stub, so it has no run of its own.
	 */
	function joined(direction: Direction): Diagram {
		return architecture({ title: "Joined", direction }, (d) => {
			const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
			const admin = d.node({ id: "admin-app", kind: "client", title: "Admin app" });
			const gateway = d.node({ id: "gateway", kind: "gateway", title: "Gateway" });
			d.edge(web, gateway, { kind: "call", label: "Signs in" });
			d.edge(admin, gateway, { kind: "call" });
		});
	}

	test.each(directions)(
		"goes beside its route's midpoint, and lint warns, laid out %s",
		(direction) => {
			const { scene, diagnostics } = render(joined(direction));
			const edge = scene?.edges.find(({ id }) => id === "web-app->gateway");
			if (scene === undefined || edge === undefined) {
				throw new Error("expected the web app's Edge");
			}
			expect(ownStretches(scene, edge)).toEqual([]);
			expect(diagnostics).toEqual([
				{
					severity: "warning",
					rule: "label-placement",
					message:
						"Edge `web-app->gateway`'s label has no room beside any run of the Edge's own, clear of Nodes, Port stubs, Group labels and other labels, so it's drawn at the middle of its route.",
					pointer: "/edges/0",
				},
			]);
			// The route is one straight run from Port to Port, so its midpoint is
			// halfway between them. The label is centered there, beside the run.
			const [from, to] = [edge.fromPort.point, edge.toPort.point];
			const horizontal = from.y === to.y;
			const [line, middle] = horizontal
				? [from.y, (from.x + to.x) / 2]
				: [from.x, (from.y + to.y) / 2];
			const box = edge.label?.box ?? scene.bounds;
			const [start, size, near, far] = horizontal
				? [box.x, box.width, box.y, box.y + box.height]
				: [box.y, box.height, box.x, box.x + box.width];
			expect(start + size / 2).toBeCloseTo(middle, 9);
			const gap = near > line ? near - line : line - far;
			expect(gap).toBeGreaterThan(0);
			expect(gap).toBeLessThanOrEqual(8);
		},
	);
});

describe("the gap between two ranks", () => {
	test.each(directions)(
		"leaves room for the label of an Edge that spans it, shown in full between the stubs, laid out %s",
		(direction) => {
			const rank = direction === "right" ? "x" : "y";
			for (const text of ["Orders", "Sends each order placed"]) {
				const scene = sceneOf(chain(direction, text));
				const edge = edgeOf(scene, "web-app->shop-api");
				expect(edge.route).toHaveLength(2);
				const label = edge.label;
				expect(label?.text?.text).toBe(text);
				expect(label?.text?.shortened).toBe(false);
				const [start, end] = span(label?.box ?? scene.bounds, rank);
				expect(start, text).toBeGreaterThanOrEqual(edge.fromPort.stub[rank]);
				expect(end, text).toBeLessThanOrEqual(edge.toPort.stub[rank]);
			}
		},
	);

	test("without labels to hold, stays the usual size", () => {
		const scene = sceneOf(chain("right", "Sends each order placed"));
		const box = (id: string) => scene.nodes.find((node) => node.id === id)?.box ?? scene.bounds;
		const gap = (from: string, to: string) => box(to).x - (box(from).x + box(from).width);
		expect(gap("shop-api", "shop-db")).toBeLessThan(gap("web-app", "shop-api"));
		expect(gap("shop-api", "shop-db")).toBe(96);
	});
});

describe("the SVG", () => {
	test("draws each label's box and texts where the scene puts them, over every Edge and beneath every Node", () => {
		const { scene, svg } = render(orders("right"));
		const root = parseSvg(svg ?? "");
		const all = descendants(root);
		const label = edgeOf(
			scene ?? ({ edges: [] } as unknown as Scene),
			"orders-api->payments-api",
		).label;
		const group = all.find(
			(element) => element.attributes.get("data-edge-label") === "orders-api->payments-api",
		);
		if (group === undefined || label === undefined) {
			throw new Error("expected the label drawn in a group that names its Edge");
		}
		const box = descendants(group).find((element) => element.name === "rect");
		expect(["x", "y", "width", "height"].map((name) => Number(box?.attributes.get(name)))).toEqual(
			[label.box.x, label.box.y, label.box.width, label.box.height].map(twoDecimals),
		);
		const texts = descendants(group).filter((element) => element.name === "text");
		expect(
			texts.map((text) => [
				text.text,
				Number(text.attributes.get("x")),
				Number(text.attributes.get("y")),
				Number(text.attributes.get("font-size")),
				text.attributes.get("font-weight"),
			]),
		).toEqual(
			[label.text, label.technology, label.rate].map((text) => [
				text?.text,
				twoDecimals(text?.point.x ?? 0),
				twoDecimals(text?.point.y ?? 0),
				text?.size,
				"400",
			]),
		);
		const lastEdge = all.findLast((element) => element.attributes.has("data-edge"));
		const firstNode = all.find((element) => element.attributes.has("data-node"));
		expect(all.indexOf(group)).toBeGreaterThan(all.indexOf(lastEdge ?? root));
		expect(all.indexOf(group)).toBeLessThan(all.indexOf(firstNode ?? root));
	});

	test("hides what passes behind a label in the background's color, and draws its Technology and rate muted", () => {
		const root = parseSvg(render(orders("right")).svg ?? "");
		const rules = rulesOf(root);
		// The drawing's background is the first shape it paints.
		const background = descendants(root).find((element) => element.name === "rect");
		const group = descendants(root).find((element) => element.attributes.has("data-edge-label"));
		const [box, text, technology, rate] = descendants(group ?? root).filter((element) =>
			["rect", "text"].includes(element.name),
		);
		for (const theme of ["light", "dark"] as const) {
			const fill = (element: Element | undefined) =>
				computedStyle(element ?? root, rules, theme).get("fill");
			expect(box?.name, theme).toBe("rect");
			expect(fill(box), theme).toBe(fill(background));
			expect(fill(technology), theme).not.toBe(fill(text));
			expect(fill(rate), theme).toBe(fill(technology));
		}
	});
});

/** A number as the SVG writes it, with at most two decimals. */
function twoDecimals(value: number): number {
	return Math.round(value * 100) / 100;
}
