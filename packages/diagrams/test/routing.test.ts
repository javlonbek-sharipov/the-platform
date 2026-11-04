import { describe, expect, test } from "vitest";
import {
	architecture,
	type Box,
	type Diagram,
	type Direction,
	type Point,
	render,
	type Scene,
	type SceneNode,
	type ScenePort,
	type Side,
} from "../src/index.ts";

const shop = architecture({ title: "Shop" }, (d) => {
	const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
	const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
	const db = d.node({ id: "shop-db", kind: "database", title: "Shop database" });
	const events = d.node({ id: "shop-events", kind: "queue", title: "Shop events" });
	const mail = d.node({ id: "mailer", kind: "worker", title: "Mailer" });
	d.edge(web, api, { kind: "call" });
	d.edge(api, db, { kind: "call" });
	d.edge(api, events, { kind: "message" });
	d.edge(events, mail, { kind: "message" });
});

/**
 * The Gateway calls the Orders database, and the Orders API stands between
 * them. Order events run back, against the direction, to the Orders API. The
 * Mailer retries its own messages, through a self-loop.
 */
const orders = architecture({ title: "Orders" }, (d) => {
	const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
	const gateway = d.node({ id: "gateway", kind: "gateway", title: "Gateway" });
	const api = d.node({ id: "orders-api", kind: "service", title: "Orders API" });
	const db = d.node({ id: "orders-db", kind: "database", title: "Orders database" });
	const events = d.node({ id: "order-events", kind: "queue", title: "Order events" });
	const mailer = d.node({ id: "mailer", kind: "worker", title: "Mailer" });
	d.edge(web, gateway, { kind: "call" });
	d.edge(gateway, api, { kind: "call" });
	d.edge(api, db, { kind: "call" });
	d.edge(gateway, db, { kind: "call" });
	d.edge(api, events, { kind: "message" });
	d.edge(events, api, { kind: "message" });
	d.edge(events, mailer, { kind: "message" });
	d.edge(mailer, mailer, { kind: "message", id: "mailer-retries" });
});

/** The same Diagram, drawn top to bottom. */
function down(diagram: Diagram): Diagram {
	return { ...diagram, direction: "down" };
}

const fixtures: [string, Diagram][] = [
	["shop", shop],
	["orders", orders],
	["shop, drawn down", down(shop)],
	["orders, drawn down", down(orders)],
];

function sceneOf(diagram: unknown): Scene {
	const { scene, diagnostics } = render(diagram);
	expect(diagnostics).toEqual([]);
	if (scene === undefined) {
		throw new Error("expected a scene");
	}
	return scene;
}

function nodeOf(scene: Scene, id: string): SceneNode {
	const node = scene.nodes.find((candidate) => candidate.id === id);
	if (node === undefined) {
		throw new Error(`no Node ${id} in the scene`);
	}
	return node;
}

/** The unit vector that points out of a Node through its side. */
const outward: Record<Side, Point> = {
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
	top: { x: 0, y: -1 },
	bottom: { x: 0, y: 1 },
};

/** How far a point lies from a box: zero inside it. */
function distanceToBox(point: Point, box: Box): number {
	const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.width));
	const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.height));
	return Math.sqrt(dx * dx + dy * dy);
}

function portsOf(node: SceneNode): ScenePort[] {
	return [node.input, node.output];
}

/** Just the coordinates of a route's point. */
function at({ x, y }: Point): Point {
	return { x, y };
}

/**
 * The part of the horizontal or vertical segment from `a` to `b` that lies
 * inside a box or on its border, as the two corners of its own bounding box.
 */
function overlap(a: Point, b: Point, box: Box): [Point, Point] | undefined {
	const left = Math.max(Math.min(a.x, b.x), box.x);
	const right = Math.min(Math.max(a.x, b.x), box.x + box.width);
	const top = Math.max(Math.min(a.y, b.y), box.y);
	const bottom = Math.min(Math.max(a.y, b.y), box.y + box.height);
	return left <= right && top <= bottom
		? [
				{ x: left, y: top },
				{ x: right, y: bottom },
			]
		: undefined;
}

/** Each segment of a route, as its two ends. */
function segmentsOf(route: Point[]): [Point, Point][] {
	return route.slice(1).flatMap((end, index) => {
		const start = route[index];
		return start === undefined ? [] : [[at(start), at(end)] as [Point, Point]];
	});
}

/**
 * Whether a route goes around a box: some run of it passes the box from one
 * side to the other, outside it.
 */
function goesAround(route: Point[], box: Box): boolean {
	return segmentsOf(route).some(([a, b]) => {
		const [low, high] =
			a.y === b.y
				? [Math.min(a.x, b.x), Math.max(a.x, b.x)]
				: [Math.min(a.y, b.y), Math.max(a.y, b.y)];
		return a.y === b.y
			? (a.y < box.y || a.y > box.y + box.height) && low <= box.x && high >= box.x + box.width
			: (a.x < box.x || a.x > box.x + box.width) && low <= box.y && high >= box.y + box.height;
	});
}

/** Whether `point` lies on the horizontal or vertical segment from `a` to `b`. */
function onSegment(point: Point, a: Point | undefined, b: Point | undefined): boolean {
	if (a === undefined || b === undefined) {
		return false;
	}
	const within = (value: number, end1: number, end2: number) =>
		Math.min(end1, end2) <= value && value <= Math.max(end1, end2);
	return (
		(a.x === b.x && point.x === a.x && within(point.y, a.y, b.y)) ||
		(a.y === b.y && point.y === a.y && within(point.x, a.x, b.x))
	);
}

describe("Ports", () => {
	test("for `right`, the input Port is on the left side and the output Port on the right, level with the header", () => {
		for (const { box, input, output, title } of sceneOf(shop).nodes) {
			expect(input.side).toBe("left");
			expect(input.point).toEqual({ x: box.x, y: title.point.y });
			expect(output.side).toBe("right");
			expect(output.point).toEqual({ x: box.x + box.width, y: title.point.y });
		}
	});

	test("for `down`, the input Port is in the middle of the top side and the output Port in the middle of the bottom", () => {
		for (const { box, input, output } of sceneOf(down(shop)).nodes) {
			const middle = box.x + box.width / 2;
			expect(input.side).toBe("top");
			expect(input.point).toEqual({ x: middle, y: box.y });
			expect(output.side).toBe("bottom");
			expect(output.point).toEqual({ x: middle, y: box.y + box.height });
		}
	});

	test("every Port has a short, straight stub, at a right angle to its side", () => {
		for (const scene of [sceneOf(shop), sceneOf(down(shop))]) {
			for (const node of scene.nodes) {
				for (const { side, point, stub } of portsOf(node)) {
					const normal = outward[side];
					const length = (stub.x - point.x) * normal.x + (stub.y - point.y) * normal.y;
					expect(length).toBeGreaterThan(0);
					expect(stub).toEqual({ x: point.x + normal.x * length, y: point.y + normal.y * length });
					// Short: the stub's end is no nearer to any other Node than to its own.
					for (const other of scene.nodes.filter((candidate) => candidate !== node)) {
						expect(distanceToBox(stub, other.box)).toBeGreaterThanOrEqual(length);
					}
				}
			}
		}
	});
});

describe("an Edge", () => {
	test("that is a self-loop goes around its own Node", () => {
		for (const scene of [sceneOf(orders), sceneOf(down(orders))]) {
			const loop = scene.edges.find((edge) => edge.id === "mailer-retries");
			expect(loop && goesAround(loop.route, nodeOf(scene, "mailer").box)).toBe(true);
		}
	});

	test("that runs against the direction goes back around both of its Nodes", () => {
		for (const scene of [sceneOf(orders), sceneOf(down(orders))]) {
			const back = scene.edges.find((edge) => edge.id === "order-events->orders-api");
			expect(back && goesAround(back.route, nodeOf(scene, "order-events").box)).toBe(true);
			expect(back && goesAround(back.route, nodeOf(scene, "orders-api").box)).toBe(true);
		}
	});

	test("squeezed between two Nodes of one rank runs down the middle of the corridor between them", () => {
		// The Web app calls the Audit log, whose Port is level with the corridor
		// between the Orders API and the Payments API.
		const scene = sceneOf(
			architecture({ title: "Corridor" }, (d) => {
				const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
				const orders = d.node({ id: "orders-api", kind: "service", title: "Orders API" });
				const payments = d.node({ id: "payments-api", kind: "service", title: "Payments API" });
				const ledger = d.node({ id: "ledger", kind: "database", title: "Ledger" });
				const audit = d.node({ id: "audit-log", kind: "storage", title: "Audit log" });
				d.edge(web, orders, { kind: "call" });
				d.edge(web, payments, { kind: "call" });
				d.edge(orders, ledger, { kind: "call" });
				d.edge(payments, audit, { kind: "call" });
				d.edge(web, audit, { kind: "message" });
			}),
		);
		const above = nodeOf(scene, "orders-api").box;
		const below = nodeOf(scene, "payments-api").box;
		const edge = scene.edges.find(({ id }) => id === "web-app->audit-log");
		const between = segmentsOf(edge?.route ?? []).filter(
			([a, b]) =>
				a.y === b.y && Math.min(a.x, b.x) <= above.x && Math.max(a.x, b.x) >= above.x + above.width,
		);
		expect(between.map(([a]) => a.y)).toEqual([(above.y + above.height + below.y) / 2]);
	});

	test("records its two Ports: its source's output Port and its target's input Port", () => {
		for (const scene of [sceneOf(shop), sceneOf(down(shop))]) {
			for (const edge of scene.edges) {
				expect(edge.fromPort).toEqual(nodeOf(scene, edge.from).output);
				expect(edge.toPort).toEqual(nodeOf(scene, edge.to).input);
			}
		}
	});
});

describe.each(fixtures)("every route in %s", (_, diagram) => {
	test("exists, one for each Edge, and none of them fell back", () => {
		const scene = sceneOf(diagram);
		expect(scene.edges.map(({ id, fellBack }) => [id, fellBack])).toEqual(
			diagram.edges.map(({ id }) => [id, false]),
		);
	});

	test("leaves and enters its Nodes at right angles to their sides, along its Ports' stubs", () => {
		for (const { id, route, fromPort, toPort } of sceneOf(diagram).edges) {
			const [first, second] = route;
			expect(first && at(first)).toEqual(fromPort.point);
			expect(onSegment(fromPort.stub, first, second), `${id} leaves off its stub`).toBe(true);
			const [beforeLast, last] = route.slice(-2);
			expect(last && at(last)).toEqual(toPort.point);
			expect(onSegment(toPort.stub, beforeLast, last), `${id} enters off its stub`).toBe(true);
		}
	});

	test("rounds every corner with an arc whose radius is at most half of either run that meets there", () => {
		const length = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
		for (const { id, route } of sceneOf(diagram).edges) {
			route.forEach((point, index) => {
				const before = route[index - 1];
				const after = route[index + 1];
				if (before === undefined || after === undefined) {
					expect(point.radius, `${id} has a radius at one end`).toBe(0);
					return;
				}
				expect(point.radius, `${id} has a sharp corner`).toBeGreaterThan(0);
				expect(point.radius).toBeLessThanOrEqual(length(before, point) / 2);
				expect(point.radius).toBeLessThanOrEqual(length(point, after) / 2);
			});
		}
	});

	test("is made of horizontal and vertical runs that take turns, each run merging the steps it's made of", () => {
		for (const { id, route } of sceneOf(diagram).edges) {
			const runs = segmentsOf(route).map(([a, b]) => {
				expect(a.x === b.x || a.y === b.y, `${id} has a slanted segment`).toBe(true);
				expect(a.x !== b.x || a.y !== b.y, `${id} has an empty segment`).toBe(true);
				return a.y === b.y ? "horizontal" : "vertical";
			});
			runs.slice(1).forEach((run, index) => {
				expect(run, `${id} has two ${run} runs in a row`).not.toBe(runs[index]);
			});
		}
	});

	test("stays out of every Node, touching only its own two Ports", () => {
		const scene = sceneOf(diagram);
		for (const { id, route, fromPort, toPort } of scene.edges) {
			for (const [a, b] of segmentsOf(route)) {
				for (const node of scene.nodes) {
					const inside = overlap(a, b, node.box);
					if (inside === undefined) {
						continue;
					}
					// Only a single point may touch a Node: the Port the route leaves or enters.
					const [first, last] = inside;
					const touchesPort =
						first.x === last.x &&
						first.y === last.y &&
						[fromPort.point, toPort.point].some(({ x, y }) => x === first.x && y === first.y);
					expect(touchesPort, `${id} passes through ${node.id}`).toBe(true);
				}
			}
		}
	});
});

describe("an Edge that the search can't route", () => {
	/** A budget so small that every search runs out. */
	const tiny = { searchBudget: 1 };

	test("still gets a route, and the core warns that it fell back", () => {
		const { scene, diagnostics } = render(orders, tiny);
		expect(scene?.edges.map(({ id, fellBack }) => [id, fellBack])).toEqual(
			orders.edges.map(({ id }) => [id, true]),
		);
		expect(diagnostics).toEqual(
			orders.edges.map(({ id }, index) => ({
				severity: "warning",
				rule: "fallback-route",
				message: `Edge \`${id}\` couldn't be routed around the Nodes, so it's drawn along a simple route that may cross them.`,
				pointer: `/edges/${index}`,
			})),
		);
	});

	test("runs straight, jogs once halfway between its Ports, and runs on, when its target lies ahead", () => {
		const ahead = [
			"web-app->gateway",
			"gateway->orders-api",
			"orders-api->orders-db",
			"gateway->orders-db",
			"orders-api->order-events",
			"order-events->mailer",
		];
		const { scene } = render(orders, tiny);
		for (const { id, route, fromPort, toPort } of scene?.edges ?? []) {
			if (ahead.includes(id)) {
				expect(route.map(at), id).toEqual(jogHalfway(fromPort.point, toPort.point, "right"));
			}
		}
	});

	test("otherwise steps out of its source, goes back past both Nodes in a lane beyond them, and enters its target from the input side", () => {
		for (const diagram of [orders, down(orders)]) {
			const { scene } = render(diagram, tiny);
			for (const { id, route, from, to, fromPort, toPort } of scene?.edges ?? []) {
				const back = ["order-events->orders-api", "mailer-retries"].includes(id);
				if (!back || scene === undefined) {
					continue;
				}
				expect(route, id).toHaveLength(6);
				expect(at(route[1] ?? fromPort.point)).toEqual(fromPort.stub);
				expect(at(route[4] ?? toPort.point)).toEqual(toPort.stub);
				const boxes = [nodeOf(scene, from).box, nodeOf(scene, to).box];
				for (const box of boxes) {
					expect(goesAround(route, box), id).toBe(true);
				}
				// The lane between the two stubs passes both Nodes on the same side.
				const [laneStart, laneEnd] = [route[2] ?? fromPort.point, route[3] ?? toPort.point];
				const beyondBoth =
					laneStart.y === laneEnd.y
						? laneStart.y < Math.min(...boxes.map((box) => box.y)) ||
							laneStart.y > Math.max(...boxes.map((box) => box.y + box.height))
						: laneStart.x < Math.min(...boxes.map((box) => box.x)) ||
							laneStart.x > Math.max(...boxes.map((box) => box.x + box.width));
				expect(beyondBoth, `${id}'s lane runs between its Nodes`).toBe(true);
			}
		}
	});
});

/** The spec's fallback for a target ahead: straight, one jog halfway between the Ports, straight on. */
function jogHalfway(from: Point, to: Point, direction: Direction): Point[] {
	if (direction === "down") {
		const middle = (from.y + to.y) / 2;
		return from.x === to.x
			? [from, to]
			: [from, { x: from.x, y: middle }, { x: to.x, y: middle }, to];
	}
	const middle = (from.x + to.x) / 2;
	return from.y === to.y
		? [from, to]
		: [from, { x: middle, y: from.y }, { x: middle, y: to.y }, to];
}
