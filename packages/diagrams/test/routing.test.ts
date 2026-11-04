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
import { groupFixtures, labelInTheWay } from "./fixtures/groups.ts";

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
	...groupFixtures.flatMap(([name, fixture]): [string, Diagram][] => [
		[name, fixture("right")],
		[`${name}, drawn down`, fixture("down")],
	]),
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

/** How long a stretch of the horizontal or vertical segment from `a` to `b` runs along a side of a box. */
function alongSides(a: Point, b: Point, box: Box): number {
	const [low, high, at, sides, from, to] =
		a.y === b.y
			? [
					Math.min(a.x, b.x),
					Math.max(a.x, b.x),
					a.y,
					[box.y, box.y + box.height],
					box.x,
					box.x + box.width,
				]
			: [
					Math.min(a.y, b.y),
					Math.max(a.y, b.y),
					a.x,
					[box.x, box.x + box.width],
					box.y,
					box.y + box.height,
				];
	return sides.includes(at) ? Math.max(0, Math.min(high, to) - Math.max(low, from)) : 0;
}

/** Whether any part of a route lies inside a box, beyond its border. */
function entersBox(route: Point[], box: Box): boolean {
	return segmentsOf(route).some(
		([a, b]) =>
			Math.max(a.x, b.x) > box.x &&
			Math.min(a.x, b.x) < box.x + box.width &&
			Math.max(a.y, b.y) > box.y &&
			Math.min(a.y, b.y) < box.y + box.height,
	);
}

/** Whether a route ever leaves a box: some point of it lies outside, beyond the border. */
function leavesBox(route: Point[], box: Box): boolean {
	return route.some(
		({ x, y }) => x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height,
	);
}

/** The ids of the Groups that hold a Node, innermost first, read from the model. */
function groupsHolding(diagram: Diagram, id: string): string[] {
	const parent = diagram.groups.find((group) => group.members.includes(id));
	return parent === undefined ? [] : [parent.id, ...groupsHolding(diagram, parent.id)];
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

	test("squeezed between two Nodes one clearance apart runs down the middle of the corridor between them", () => {
		// The Orders API fans out to three Nodes, which layout packs one clearance
		// apart. The Billing worker calls back, against the direction, so its
		// route has to cross the fan.
		const scene = sceneOf(
			architecture({ title: "Corridor" }, (d) => {
				const api = d.node({ id: "orders-api", kind: "service", title: "Orders API" });
				const db = d.node({ id: "orders-db", kind: "database", title: "Orders database" });
				const events = d.node({ id: "order-events", kind: "queue", title: "Order events" });
				const cache = d.node({ id: "orders-cache", kind: "cache", title: "Orders cache" });
				const worker = d.node({ id: "billing-worker", kind: "worker", title: "Billing worker" });
				d.edge(api, db, { kind: "call" });
				d.edge(api, events, { kind: "message" });
				d.edge(api, cache, { kind: "call" });
				d.edge(events, worker, { kind: "message" });
				d.edge(worker, api, { kind: "call" });
			}),
		);
		const fan = ["orders-db", "order-events", "orders-cache"].map((id) => nodeOf(scene, id).box);
		const column = fan[0] ?? scene.bounds;
		const back = scene.edges.find(({ id }) => id === "billing-worker->orders-api");
		const across = segmentsOf(back?.route ?? []).filter(
			([a, b]) =>
				a.y === b.y &&
				Math.min(a.x, b.x) <= column.x &&
				Math.max(a.x, b.x) >= column.x + column.width,
		);
		expect(across).toHaveLength(1);
		const y = across[0]?.[0].y ?? 0;
		const above = fan.filter((box) => box.y + box.height < y).at(-1);
		const below = fan.find((box) => box.y > y);
		if (above === undefined || below === undefined) {
			throw new Error("the route doesn't pass between two Nodes of the fan");
		}
		expect(below.y - (above.y + above.height)).toBe(scene.clearance);
		expect(y).toBe((above.y + above.height + below.y) / 2);
	});

	test("gets the same route whatever order the Diagram declares its Edges in", () => {
		const routes = (diagram: Diagram) =>
			Object.fromEntries(sceneOf(diagram).edges.map(({ id, route }) => [id, route]));
		const reversed: Diagram = { ...orders, edges: [...orders.edges].reverse() };
		expect(routes(reversed)).toEqual(routes(orders));
	});
});

describe.each(fixtures)("every route in %s", (_, diagram) => {
	test("exists, one for each Edge, and none of them fell back", () => {
		const scene = sceneOf(diagram);
		expect(scene.edges.map(({ id, fellBack }) => [id, fellBack])).toEqual(
			diagram.edges.map(({ id }) => [id, false]),
		);
	});

	test("records its Edge's two Ports: its source's output Port and its target's input Port", () => {
		const scene = sceneOf(diagram);
		for (const edge of scene.edges) {
			expect(edge.fromPort).toEqual(nodeOf(scene, edge.from).output);
			expect(edge.toPort).toEqual(nodeOf(scene, edge.to).input);
		}
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

	test("never passes through a Group label, nor touches one", () => {
		const scene = sceneOf(diagram);
		for (const { id, route } of scene.edges) {
			for (const [a, b] of segmentsOf(route)) {
				for (const group of scene.groups) {
					expect(overlap(a, b, group.label), `${id} passes ${group.id}'s label`).toBeUndefined();
				}
			}
		}
	});

	test("between two Nodes of one Group stays inside that Group", () => {
		const scene = sceneOf(diagram);
		for (const { id, from, to, route } of scene.edges) {
			const holding = groupsHolding(diagram, to);
			for (const group of groupsHolding(diagram, from).filter((g) => holding.includes(g))) {
				const box = scene.groups.find((candidate) => candidate.id === group)?.box ?? scene.bounds;
				expect(leavesBox(route, box), `${id} leaves ${group}`).toBe(false);
			}
		}
	});

	test("never runs along a Group's border", () => {
		const scene = sceneOf(diagram);
		for (const { id, route } of scene.edges) {
			for (const [a, b] of segmentsOf(route)) {
				for (const group of scene.groups) {
					expect(alongSides(a, b, group.box), `${id} runs along ${group.id}`).toBe(0);
				}
			}
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

describe("a Group's border", () => {
	test("keeps an Edge between two of its Nodes inside it, though open space lies just outside it", () => {
		// The Ledger calls back to the Cart API, against the direction, so the route
		// goes around the Payments API between them. The system sits at the top
		// left of the drawing, so the way around outside it is open as well.
		const checkout = architecture({ title: "Checkout" }, (d) => {
			d.group({ id: "checkout", kind: "system", title: "Checkout" }, (system) => {
				const cart = system.node({ id: "cart-api", kind: "service", title: "Cart API" });
				const payments = system.node({
					id: "payments-api",
					kind: "service",
					title: "Payments API",
				});
				const ledger = system.node({ id: "ledger", kind: "worker", title: "Ledger" });
				d.edge(cart, payments, { kind: "call" });
				d.edge(payments, ledger, { kind: "message" });
				d.edge(ledger, cart, { kind: "call" });
			});
			d.node({ id: "web-app", kind: "client", title: "Web app" });
		});
		for (const scene of [sceneOf(checkout), sceneOf(down(checkout))]) {
			const back = scene.edges.find(({ id }) => id === "ledger->cart-api");
			const system = scene.groups[0]?.box ?? scene.bounds;
			expect(back && goesAround(back.route, nodeOf(scene, "payments-api").box)).toBe(true);
			expect(back && leavesBox(back.route, system)).toBe(false);
		}
	});

	test("costs a little to cross, so an Edge passes beside a Group it doesn't start or end in, where that's no longer", () => {
		// The Mailer sits below the zone, and the Ledger level with the Shop API in
		// it. The Mailer's Edge can turn up toward the Ledger beside the zone or
		// through its padding, at the same length.
		const region = architecture({ title: "Region" }, (d) => {
			d.group({ id: "eu-west", kind: "region", title: "EU West" }, (eu) => {
				eu.group({ id: "eu-west-a", kind: "zone", title: "Zone A" }, (zone) => {
					zone.node({ id: "shop-api", kind: "service", title: "Shop API" });
				});
				eu.node({ id: "ledger", kind: "worker", title: "Ledger" });
				eu.node({ id: "mailer", kind: "worker", title: "Mailer" });
			});
			d.edge("shop-api", "ledger", { kind: "call" });
			d.edge("mailer", "ledger", { kind: "call" });
		});
		const scene = sceneOf(region);
		const zone = scene.groups.find(({ id }) => id === "eu-west-a")?.box ?? scene.bounds;
		const mail = scene.edges.find(({ id }) => id === "mailer->ledger")?.route ?? [];

		expect(nodeOf(scene, "ledger").input.point.y).toBe(nodeOf(scene, "shop-api").output.point.y);
		expect(nodeOf(scene, "mailer").box.y).toBeGreaterThan(zone.y + zone.height);
		expect(entersBox(mail, zone)).toBe(false);
	});
});

describe("a Group label in an Edge's way", () => {
	test("makes the Edge go around it, half a clearance clear of it", () => {
		const scene = sceneOf(labelInTheWay("down"));
		const { label } = scene.groups[0] ?? { label: scene.bounds };
		const route = scene.edges[0]?.route ?? [];
		const half = scene.clearance / 2;
		// A run beside the label passes it from top to bottom, half a clearance from one side.
		const beside = segmentsOf(route).filter(
			([a, b]) =>
				a.x === b.x &&
				(a.x === label.x - half || a.x === label.x + label.width + half) &&
				Math.min(a.y, b.y) <= label.y &&
				Math.max(a.y, b.y) >= label.y + label.height,
		);
		expect(beside).toHaveLength(1);
	});
});

describe("an Edge that the search can't route", () => {
	/** A budget so small that every search runs out. */
	const tiny = { searchBudget: 1 };

	/** The Edges of `orders` whose target lies ahead of their source, along each direction. */
	const ahead: [Diagram, string[]][] = [
		[
			orders,
			[
				"web-app->gateway",
				"gateway->orders-api",
				"orders-api->orders-db",
				"gateway->orders-db",
				"orders-api->order-events",
				"order-events->mailer",
			],
		],
		[
			down(orders),
			[
				"web-app->gateway",
				"gateway->orders-api",
				"orders-api->orders-db",
				"gateway->orders-db",
				"orders-api->order-events",
				"order-events->mailer",
			],
		],
	];

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
		for (const [diagram, ids] of ahead) {
			const { scene } = render(diagram, tiny);
			for (const { id, route, fromPort, toPort } of scene?.edges ?? []) {
				if (ids.includes(id)) {
					expect(route.map(at), id).toEqual(
						jogHalfway(fromPort.point, toPort.point, diagram.direction),
					);
				}
			}
		}
	});

	test("otherwise steps out of its source, goes back past both Nodes in a lane beyond them, and enters its target from the input side", () => {
		for (const [diagram, ids] of ahead) {
			const { scene } = render(diagram, tiny);
			for (const { id, route, from, to, fromPort, toPort } of scene?.edges ?? []) {
				if (ids.includes(id) || scene === undefined) {
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
