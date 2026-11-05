import { describe, expect, test } from "vitest";
import {
	type ArchitectureNotation,
	architecture,
	type Box,
	type DiagramOf,
	type Direction,
	type Point,
	type RoutePoint,
	render,
	type Scene,
	type SceneEdge,
	type SceneNode,
	type ScenePort,
	type Side,
} from "../src/index.ts";
import { crowded } from "./fixtures/crowded.ts";
import { groupFixtures, labelInTheWay, twoRegions } from "./fixtures/groups.ts";
import { labeled } from "./support/labeled.ts";

/** The tests here draw architecture Diagrams, so they read the fields that those have. */
type Diagram = DiagramOf<ArchitectureNotation>;
type Edge = Diagram["edges"][number];

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

/**
 * Edges attached to Rows. The Orders API publishes to the `order-placed`
 * topic, which the Payments API reads, and the Payments API publishes back
 * to `order-paid`, against the direction. Each API writes to its own table,
 * and the database archives orders from one of its Rows to another, through
 * a self-loop.
 */
const rows = architecture({ title: "Rows" }, (d) => {
	const api = d.node({
		id: "orders-api",
		kind: "service",
		title: "Orders API",
		rows: [{ name: "replicas", value: "3" }],
	});
	const events = d.node({
		id: "order-events",
		kind: "queue",
		title: "Order events",
		rows: [{ name: "order-placed" }, { name: "order-paid" }],
	});
	const payments = d.node({ id: "payments-api", kind: "service", title: "Payments API" });
	const db = d.node({
		id: "orders-db",
		kind: "database",
		title: "Orders database",
		rows: [
			{ name: "orders", value: "table" },
			{ name: "payments", value: "table" },
			{ name: "archive", value: "table" },
		],
	});
	d.edge(api, events.row("order-placed"), { kind: "message" });
	d.edge(events.row("order-placed"), payments, { kind: "message" });
	d.edge(payments, events.row("order-paid"), { kind: "message" });
	d.edge(api, db.row("orders"), { kind: "call" });
	d.edge(payments, db.row("payments"), { kind: "call" });
	d.edge(db.row("orders"), db.row("archive"), { kind: "message", id: "archive-orders" });
});

/**
 * Eleven APIs that call one another every which way, so that several
 * Edges close cycles. Routed once, the corridor below the top row of APIs
 * holds one lane more than fits, so the Edges negotiate for room.
 */
const crossTalk = architecture({ title: "Cross-talk" }, (d) => {
	const names = ["accounts", "billing", "catalog", "delivery", "email", "fulfilment"];
	const more = ["goods", "history", "inventory", "kiosk", "ledger"];
	for (const name of [...names, ...more]) {
		d.node({ id: `${name}-api`, kind: "service", title: `${name} API` });
	}
	const joins: [string, string, "call" | "message"][] = [
		["delivery", "email", "call"],
		["delivery", "ledger", "call"],
		["ledger", "goods", "call"],
		["accounts", "inventory", "call"],
		["email", "fulfilment", "call"],
		["history", "accounts", "call"],
		["billing", "catalog", "message"],
		["delivery", "accounts", "message"],
		["billing", "fulfilment", "call"],
		["fulfilment", "goods", "call"],
		["email", "ledger", "call"],
		["goods", "delivery", "call"],
		["history", "catalog", "call"],
		["catalog", "kiosk", "call"],
		["catalog", "history", "call"],
		["goods", "email", "call"],
		["inventory", "fulfilment", "message"],
		["ledger", "history", "call"],
		["history", "inventory", "message"],
		["ledger", "catalog", "call"],
		["fulfilment", "billing", "call"],
	];
	for (const [from, to, kind] of joins) {
		d.edge(`${from}-api`, `${to}-api`, { kind });
	}
});

/** The same Diagram, drawn top to bottom. */
function down(diagram: Diagram): Diagram {
	return { ...diagram, direction: "down" };
}

const fixtures: [string, Diagram][] = [
	["shop", shop],
	["orders", orders],
	["rows", rows],
	["shop, drawn down", down(shop)],
	["orders, drawn down", down(orders)],
	["rows, drawn down", down(rows)],
	...groupFixtures.flatMap(([name, fixture]): [string, Diagram][] => [
		[name, fixture("right")],
		[`${name}, drawn down`, fixture("down")],
	]),
	["Edges that cross-talk", crossTalk],
	["Edges that cross-talk, drawn down", down(crossTalk)],
	["the crowded fixture", crowded("right")],
	["the crowded fixture, drawn down", crowded("down")],
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

/** A Node's Ports: its header's two, and each Row's two. */
function portsOf(node: SceneNode): ScenePort[] {
	return [node.input, node.output, ...node.rows.flatMap((row) => [row.input, row.output])];
}

/** The Node at an Edge end, or the Row it names: whichever owns the Ports the Edge uses. */
function portsAt(
	diagram: Diagram,
	scene: Scene,
	end: Edge["from"],
): { input: ScenePort; output: ScenePort } {
	if (typeof end === "string") {
		return nodeOf(scene, end);
	}
	const names = diagram.nodes.find((node) => node.id === end.node)?.rows ?? [];
	const row = nodeOf(scene, end.node).rows[
		names.findIndex((candidate) => candidate.name === end.row)
	];
	if (row === undefined) {
		throw new Error(`no Row ${end.row} on ${end.node}`);
	}
	return row;
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

/** Two lanes closer than this look like one. */
const sameLane = 0.5;

/** A Port, named by its Node and its Row, if any. */
function portKey(node: string, row: string | undefined): string {
	return row === undefined ? node : `${node}/${row}`;
}

/** Whether two Edges join the same pair of Ports. */
function parallel(a: SceneEdge, b: SceneEdge): boolean {
	return (
		portKey(a.from, a.fromRow) === portKey(b.from, b.fromRow) &&
		portKey(a.to, a.toRow) === portKey(b.to, b.toRow)
	);
}

/**
 * Whether two Edges share a bundle, read from the spec rather than the code:
 * the same Kind into the same Port, unless they're parallel.
 */
function sameBundle(a: SceneEdge, b: SceneEdge): boolean {
	return a.kind === b.kind && portKey(a.to, a.toRow) === portKey(b.to, b.toRow) && !parallel(a, b);
}

/**
 * The stretches where two routes run along the same lane: collinear
 * segments, within `sameLane` of each other, that overlap by more than that.
 * Each comes with the indices of the two segments.
 */
function sharedStretches(a: Point[], b: Point[]): [Point, Point, number, number][] {
	const shared: [Point, Point, number, number][] = [];
	segmentsOf(a).forEach(([a1, a2], i) => {
		segmentsOf(b).forEach(([b1, b2], j) => {
			const horizontal = a1.y === a2.y && b1.y === b2.y;
			const vertical = a1.x === a2.x && b1.x === b2.x;
			if (!horizontal && !vertical) {
				return;
			}
			const [across, otherAcross] = horizontal ? [a1.y, b1.y] : [a1.x, b1.x];
			const along = (p: Point) => (horizontal ? p.x : p.y);
			const low = Math.max(Math.min(along(a1), along(a2)), Math.min(along(b1), along(b2)));
			const high = Math.min(Math.max(along(a1), along(a2)), Math.max(along(b1), along(b2)));
			if (Math.abs(across - otherAcross) < sameLane && high - low > sameLane) {
				shared.push(
					horizontal
						? [{ x: low, y: across }, { x: high, y: across }, i, j]
						: [{ x: across, y: low }, { x: across, y: high }, i, j],
				);
			}
		});
	});
	return shared;
}

/**
 * Whether a stretch that Edges `a` and `b` share, on their segments `i` and
 * `j`, lies in the junction of a Port they both leave, or both enter: on the
 * stub's line, where both still run on their first run out of the Port, or
 * already on their last run into it. That's where Edges at one Port leave it
 * together, or converge on it, and turn off one by one.
 */
function inJunction(a: SceneEdge, b: SceneEdge, [i, j]: [number, number]): boolean {
	return (
		(portKey(a.from, a.fromRow) === portKey(b.from, b.fromRow) && i === 0 && j === 0) ||
		(portKey(a.to, a.toRow) === portKey(b.to, b.toRow) &&
			i === a.route.length - 2 &&
			j === b.route.length - 2)
	);
}

/** The stretches two Edges share, other than in the junction of a Port they share. */
function sharedBeyondJunctions(a: SceneEdge, b: SceneEdge): [Point, Point][] {
	return sharedStretches(a.route, b.route)
		.filter(([, , i, j]) => !inJunction(a, b, [i, j]))
		.map(([from, to]): [Point, Point] => [from, to]);
}

/** The stretches that two Edges of different bundles share beyond the junctions of their Ports, described. */
function lanesShared(a: SceneEdge, b: SceneEdge): string[] {
	return sharedBeyondJunctions(a, b).map(
		([from, to]) => `${a.id} and ${b.id} share (${from.x}, ${from.y})–(${to.x}, ${to.y})`,
	);
}

/**
 * Where route `b` leaves route `a` after it has met it, if it ever does:
 * walking `b` from its source a pixel at a time, the first point off `a`
 * after two in a row on it, which is where they began to share a stretch.
 * Crossing at a point isn't meeting.
 */
function partsAfterMeeting(a: Point[], b: Point[]): Point | undefined {
	const onA = (point: Point) => segmentsOf(a).some(([from, to]) => onSegment(point, from, to));
	let met = false;
	let before = false;
	for (const [from, to] of segmentsOf(b)) {
		const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
		for (let step = 0; step <= length; step += 1) {
			const point = {
				x: from.x + Math.sign(to.x - from.x) * step,
				y: from.y + Math.sign(to.y - from.y) * step,
			};
			const on = onA(point);
			if (on && before) {
				met = true;
			} else if (!on && met) {
				return point;
			}
			before = on;
		}
	}
	return undefined;
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
		for (const scene of [shop, down(shop), rows, down(rows)].map(sceneOf)) {
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

	test("from one Row of a Node to another goes around the Node", () => {
		for (const scene of [sceneOf(rows), sceneOf(down(rows))]) {
			const loop = scene.edges.find((edge) => edge.id === "archive-orders");
			expect(loop && goesAround(loop.route, nodeOf(scene, "orders-db").box)).toBe(true);
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

/**
 * The corridors that hold more lanes than their width allows at the lane
 * spacing. At each point along each axis where some route's run starts or
 * ends, the boxes and Group borders across that point split the line through
 * it into free corridors, and the runs that cross the point are counted in the
 * corridor they cross it in. Runs in a Port's junction don't count.
 */
function overfullCorridors(scene: Scene): string[] {
	const junction = (point: Point) =>
		scene.edges.some(({ fromPort, toPort }) =>
			[fromPort, toPort].some((port) => {
				const count = scene.edges.filter(
					(edge) => same(edge.fromPort.point, port.point) || same(edge.toPort.point, port.point),
				).length;
				const reach =
					Math.abs(port.stub.x - port.point.x) +
					Math.abs(port.stub.y - port.point.y) +
					count * scene.grid;
				return Math.abs(point.x - port.point.x) + Math.abs(point.y - port.point.y) <= reach;
			}),
		);
	const boxes = [
		...scene.nodes.flatMap(({ box, callout }) =>
			callout === undefined ? [box] : [box, callout.tag],
		),
		...scene.groups.map(({ label }) => label),
	];
	const found: string[] = [];
	for (const horizontal of [true, false]) {
		const along = (p: Point) => (horizontal ? p.x : p.y);
		const across = (p: Point) => (horizontal ? p.y : p.x);
		const runs = scene.edges.flatMap(({ route }) =>
			segmentsOf(route).filter(
				([a, b]) => (horizontal ? a.y === b.y : a.x === b.x) && !(junction(a) && junction(b)),
			),
		);
		const stops = [...new Set(runs.flatMap(([a, b]) => [along(a), along(b)]))].sort(
			(p, q) => p - q,
		);
		const samples = stops.slice(1).map((stop, index) => ((stops[index] ?? stop) + stop) / 2);
		for (const at of samples) {
			const crossing = runs.filter(
				([a, b]) => Math.min(along(a), along(b)) < at && at < Math.max(along(a), along(b)),
			);
			const sides = [
				...boxes
					.filter((box) =>
						horizontal
							? box.x < at && at < box.x + box.width
							: box.y < at && at < box.y + box.height,
					)
					.flatMap((box) =>
						horizontal ? [box.y, box.y + box.height] : [box.x, box.x + box.width],
					),
				...scene.groups
					.filter(({ box }) =>
						horizontal
							? box.x < at && at < box.x + box.width
							: box.y < at && at < box.y + box.height,
					)
					.flatMap(({ box }) =>
						horizontal ? [box.y, box.y + box.height] : [box.x, box.x + box.width],
					),
			].sort((p, q) => p - q);
			for (let index = 0; index + 1 < sides.length; index += 1) {
				const [low = 0, high = 0] = [sides[index], sides[index + 1]];
				const lanes = new Set(
					crossing.map(([a]) => across(a)).filter((value) => low < value && value < high),
				);
				if (lanes.size > (high - low) / scene.lanes.spacing) {
					found.push(
						`${lanes.size} lanes ${horizontal ? "across x" : "across y"} = ${at}, between ${low} and ${high}`,
					);
				}
			}
		}
	}
	return found;
}

/**
 * Where lanes run too close: two Edges of different bundles running side by
 * side, closer than the minimum spacing, other than in the junction of a Port
 * they share, or a lane closer than the padding to a box beside it.
 */
function tooClose(scene: Scene): string[] {
	const found: string[] = [];
	const { minimum, padding } = scene.lanes;
	const across = ([a]: [Point, Point], horizontal: boolean) => (horizontal ? a.y : a.x);
	const span = ([a, b]: [Point, Point], horizontal: boolean) =>
		horizontal
			? [Math.min(a.x, b.x), Math.max(a.x, b.x)]
			: [Math.min(a.y, b.y), Math.max(a.y, b.y)];
	const overlap = (p: number[], q: number[]) =>
		Math.min(p[1] ?? 0, q[1] ?? 0) - Math.max(p[0] ?? 0, q[0] ?? 0);
	scene.edges.forEach((a, index) => {
		for (const b of scene.edges.slice(index + 1)) {
			if (sameBundle(a, b)) {
				continue;
			}
			segmentsOf(a.route).forEach((first, i) => {
				segmentsOf(b.route).forEach((second, j) => {
					const horizontal = first[0].y === first[1].y;
					if (horizontal !== (second[0].y === second[1].y) || inJunction(a, b, [i, j])) {
						return;
					}
					const gap = Math.abs(across(first, horizontal) - across(second, horizontal));
					if (
						gap >= sameLane &&
						gap < minimum - 1e-9 &&
						overlap(span(first, horizontal), span(second, horizontal)) > sameLane
					) {
						found.push(`${a.id} and ${b.id} run ${gap} apart`);
					}
				});
			});
		}
	});
	const boxes = [
		...scene.nodes.flatMap(({ box, callout }) =>
			callout === undefined ? [box] : [box, callout.tag],
		),
		...scene.groups.map(({ label }) => label),
	];
	for (const { id, route } of scene.edges) {
		for (const segment of segmentsOf(route)) {
			const horizontal = segment[0].y === segment[1].y;
			// A Group's border beside a lane, running the same way, keeps the padding from it too.
			for (const { id: group, box } of scene.groups) {
				const sides = horizontal ? [box.y, box.y + box.height] : [box.x, box.x + box.width];
				const along = horizontal ? [box.x, box.x + box.width] : [box.y, box.y + box.height];
				const distance = Math.min(
					...sides.map((side) => Math.abs(side - across(segment, horizontal))),
				);
				if (overlap(span(segment, horizontal), along) > sameLane && distance < padding) {
					found.push(`${id} runs ${distance} from ${group}'s border`);
				}
			}
			for (const box of boxes) {
				const sides = horizontal ? [box.y, box.y + box.height] : [box.x, box.x + box.width];
				const along = horizontal ? [box.x, box.x + box.width] : [box.y, box.y + box.height];
				const distance = Math.min(
					...sides.map((side) => Math.abs(side - across(segment, horizontal))),
				);
				if (overlap(span(segment, horizontal), along) > 0 && distance < padding) {
					found.push(`${id} runs ${distance} from a box at (${box.x}, ${box.y})`);
				}
			}
		}
	}
	return found;
}

/** Points merged into runs: consecutive steps in the same direction become one run. */
function polylineOf(points: Point[]): Point[] {
	const kept: Point[] = [];
	for (const point of points) {
		const last = kept.at(-1);
		const beforeLast = kept.at(-2);
		if (last !== undefined && last.x === point.x && last.y === point.y) {
			continue;
		}
		const sameWay =
			last !== undefined &&
			beforeLast !== undefined &&
			Math.sign(last.x - beforeLast.x) === Math.sign(point.x - last.x) &&
			Math.sign(last.y - beforeLast.y) === Math.sign(point.y - last.y);
		if (sameWay) {
			kept.pop();
		}
		kept.push(point);
	}
	return kept;
}

/** The Port an Edge enters: its target. Edges into one Port meet there. */
function targetOf(edge: SceneEdge): string {
	return portKey(edge.to, edge.toRow);
}

/** A run of a route, and the part of it that's straight, between the arcs of its corners. */
interface StraightRun {
	horizontal: boolean;
	line: number;
	low: number;
	high: number;
}

function straightRunsOf(route: RoutePoint[]): StraightRun[] {
	return route.slice(1).flatMap((to, index): StraightRun[] => {
		const from = route[index];
		if (from === undefined) {
			return [];
		}
		const horizontal = from.y === to.y;
		const [lowEnd, highEnd] = (horizontal ? from.x < to.x : from.y < to.y)
			? [from, to]
			: [to, from];
		const along = (point: Point) => (horizontal ? point.x : point.y);
		return [
			{
				horizontal,
				line: horizontal ? from.y : from.x,
				low: along(lowEnd) + lowEnd.radius,
				high: along(highEnd) - highEnd.radius,
			},
		];
	});
}

/**
 * Where two routes cross at a right angle: a horizontal run of one passes
 * through a vertical run of the other, where both are straight, beyond the
 * arcs that round their corners. Each crossing comes with its two runs.
 */
function rightAngleCrossings(
	a: SceneEdge,
	b: SceneEdge,
): { point: Point; runs: [StraightRun, StraightRun] }[] {
	const found: { point: Point; runs: [StraightRun, StraightRun] }[] = [];
	for (const first of straightRunsOf(a.route)) {
		for (const second of straightRunsOf(b.route)) {
			if (first.horizontal === second.horizontal) {
				continue;
			}
			const [across, along] = first.horizontal ? [first, second] : [second, first];
			const point = { x: along.line, y: across.line };
			// At the end of a straight part, the route is still straight, unless it
			// ends there for both: then both start to curve, and neither hops.
			const rooms = [
				Math.min(point.x - across.low, across.high - point.x),
				Math.min(point.y - along.low, along.high - point.y),
			];
			if (Math.min(...rooms) >= 0 && Math.max(...rooms) > 0) {
				found.push({ point, runs: [first, second] });
			}
		}
	}
	return found;
}

/** The gaps in an Edge's stroke: from where each piece ends to where the next begins. */
function strokeGaps(edge: SceneEdge): [Point, Point][] {
	return edge.stroke.slice(1).flatMap((piece, index) => {
		const end = edge.stroke[index]?.at(-1);
		const start = piece[0];
		return end === undefined || start === undefined ? [] : [[at(end), at(start)] as [Point, Point]];
	});
}

/** Whether an Edge's stroke has a gap at a point: the point lies inside a gap, short of its ends. */
function brokenAt(edge: SceneEdge, point: Point): boolean {
	return strokeGaps(edge).some(
		([from, to]) => onSegment(point, from, to) && !same(point, from) && !same(point, to),
	);
}

describe.each(fixtures)("every route in %s", (_, diagram) => {
	test("exists, one for each Edge, and none of them fell back", () => {
		const scene = sceneOf(diagram);
		expect(scene.edges.map(({ id, fellBack }) => [id, fellBack])).toEqual(
			diagram.edges.map(({ id }) => [id, false]),
		);
	});

	test("records its Edge's two Ports: its source's output Port and its target's input Port, or those of the Rows it names", () => {
		const scene = sceneOf(diagram);
		for (const { id, from, to } of diagram.edges) {
			const edge = scene.edges.find((candidate) => candidate.id === id);
			expect(edge?.fromPort, id).toEqual(portsAt(diagram, scene, from).output);
			expect(edge?.toPort, id).toEqual(portsAt(diagram, scene, to).input);
		}
	});

	test("leaves and enters its Nodes at right angles to their sides, straight along its Ports' stubs for at least the lane padding", () => {
		const scene = sceneOf(diagram);
		for (const { id, route, fromPort, toPort } of scene.edges) {
			const [first, second] = route;
			const [beforeLast, last] = route.slice(-2);
			expect(first && at(first)).toEqual(fromPort.point);
			expect(last && at(last)).toEqual(toPort.point);
			for (const [port, near, far, end] of [
				[fromPort, first, second, "leaves"],
				[toPort, last, beforeLast, "enters"],
			] as const) {
				// The run along the stub heads straight out of the Port's side.
				const normal = outward[port.side];
				const length =
					((far?.x ?? 0) - (near?.x ?? 0)) * normal.x + ((far?.y ?? 0) - (near?.y ?? 0)) * normal.y;
				const across =
					((far?.x ?? 0) - (near?.x ?? 0)) * normal.y - ((far?.y ?? 0) - (near?.y ?? 0)) * normal.x;
				expect(across, `${id} ${end} at a slant`).toBe(0);
				expect(length, `${id} ${end} too short a stub`).toBeGreaterThanOrEqual(scene.lanes.padding);
			}
		}
	});

	test("is stroked in pieces that join up into the route, with a short gap along a straight run between each two", () => {
		const scene = sceneOf(diagram);
		for (const edge of scene.edges) {
			const { id, route, stroke } = edge;
			expect(stroke.length, id).toBeGreaterThan(0);
			// Each piece is an orthogonal polyline whose ends are sharp.
			for (const piece of stroke) {
				expect(piece.length, id).toBeGreaterThanOrEqual(2);
				expect(piece[0]?.radius, id).toBe(0);
				expect(piece.at(-1)?.radius, id).toBe(0);
			}
			// Joined at their gaps, the pieces are the route again, corners and all.
			const joined = stroke.flat();
			const corners = joined.filter((point) => point.radius > 0);
			expect(corners, id).toEqual(route.filter((point) => point.radius > 0));
			expect(polylineOf(joined.map(at)), id).toEqual(route.map(at));
			for (const [from, to] of strokeGaps(edge)) {
				expect(from.x === to.x || from.y === to.y, `${id} has a slanted gap`).toBe(true);
				const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
				expect(length, id).toBeGreaterThan(0);
				// A gap lies on a straight run of the route, clear of its corners' arcs.
				const run = straightRunsOf(route).find(
					(each) =>
						(each.horizontal ? from.y === to.y : from.x === to.x) &&
						each.line === (each.horizontal ? from.y : from.x) &&
						[from, to].every((end) => {
							const along = each.horizontal ? end.x : end.y;
							return each.low <= along && along <= each.high;
						}),
				);
				expect(run, `${id}'s gap at (${from.x}, ${from.y})`).toBeDefined();
			}
		}
	});

	test("is broken by a hop only where it crosses an Edge with a different target, which runs on unbroken there", () => {
		const { edges } = sceneOf(diagram);
		for (const edge of edges) {
			for (const [from, to] of strokeGaps(edge)) {
				const crossing = edges.some(
					(other) =>
						targetOf(other) !== targetOf(edge) &&
						rightAngleCrossings(edge, other).some(
							({ point }) => onSegment(point, from, to) && !brokenAt(other, point),
						),
				);
				expect(crossing, `${edge.id}'s gap at (${from.x}, ${from.y})`).toBe(true);
			}
		}
	});

	test("hops, or lets the other hop, wherever it crosses an Edge with a different target at a right angle", () => {
		const { edges } = sceneOf(diagram);
		edges.forEach((a, index) => {
			for (const b of edges.slice(index + 1)) {
				if (targetOf(a) === targetOf(b)) {
					continue;
				}
				for (const { point } of rightAngleCrossings(a, b)) {
					const broken = [a, b].filter((edge) => brokenAt(edge, point)).map(({ id }) => id);
					expect(broken, `${a.id} and ${b.id} at (${point.x}, ${point.y})`).toHaveLength(1);
				}
			}
		});
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

	test("shares no stretch of lane with an Edge of another bundle, beyond the junction of a Port they share", () => {
		const scene = sceneOf(diagram);
		const { edges } = scene;
		const shared = edges.flatMap((a, index) =>
			edges.slice(index + 1).flatMap((b) => (sameBundle(a, b) ? [] : lanesShared(a, b))),
		);
		expect(shared).toEqual([]);
	});

	test("runs together with the other Edges of its bundle into their Port, once it meets them", () => {
		const { edges } = sceneOf(diagram);
		const parted = edges.flatMap((a) =>
			edges
				.filter((b) => b !== a && sameBundle(a, b))
				.flatMap((b) => {
					const point = partsAfterMeeting(a.route, b.route);
					return point === undefined ? [] : [`${b.id} leaves ${a.id} at (${point.x}, ${point.y})`];
				}),
		);
		expect(parted).toEqual([]);
	});

	test("keeps at least the minimum spacing from the lanes beside it, and the padding from boxes beside it", () => {
		expect(tooClose(sceneOf(diagram))).toEqual([]);
	});

	test("shares every corridor with no more lanes than its width holds at the lane spacing", () => {
		expect(overfullCorridors(sceneOf(diagram))).toEqual([]);
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

describe.each(fixtures)("every route in %s, with every Edge labeled", (_, diagram) => {
	// Labels crowd Edges out of their trunks into lanes of their own, which
	// need room of their own (spec: Edge routing, step 8).
	test("shares every corridor with no more lanes than its width holds at the lane spacing", () => {
		const { scene } = render(labeled(diagram));
		expect(scene).toBeDefined();
		expect(overfullCorridors(scene as Scene)).toEqual([]);
	});
});

/** How many times two routes cross: a horizontal run of one passing through a vertical run of the other. */
function crossingsBetween(a: Point[], b: Point[]): number {
	let count = 0;
	for (const [a1, a2] of segmentsOf(a)) {
		for (const [b1, b2] of segmentsOf(b)) {
			const [h1, h2, v1, v2] =
				a1.y === a2.y && b1.x === b2.x
					? [a1, a2, b1, b2]
					: b1.y === b2.y && a1.x === a2.x
						? [b1, b2, a1, a2]
						: [];
			if (h1 === undefined || h2 === undefined || v1 === undefined || v2 === undefined) {
				continue;
			}
			const inside = (value: number, end1: number, end2: number) =>
				Math.min(end1, end2) < value && value < Math.max(end1, end2);
			if (inside(v1.x, h1.x, h2.x) && inside(h1.y, v1.y, v2.y)) {
				count += 1;
			}
		}
	}
	return count;
}

/**
 * Three clients call the gateway, and the partner API also sends it
 * messages. The gateway calls three APIs.
 */
const gateway = architecture({ title: "Gateway" }, (d) => {
	const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
	const mobile = d.node({ id: "mobile-app", kind: "client", title: "Mobile app" });
	const partner = d.node({ id: "partner-api", kind: "system", title: "Partner API" });
	const gate = d.node({ id: "gateway", kind: "gateway", title: "Gateway" });
	d.edge(web, gate, { kind: "call" });
	d.edge(mobile, gate, { kind: "call" });
	d.edge(partner, gate, { kind: "call", id: "partner-calls" });
	d.edge(partner, gate, { kind: "message", id: "partner-events" });
	for (const id of ["orders-api", "stock-api", "users-api"]) {
		d.node({ id, kind: "service", title: id });
		d.edge(gate, id, { kind: "call" });
	}
});

function edgeOf(scene: Scene, id: string): SceneEdge {
	const edge = scene.edges.find((candidate) => candidate.id === id);
	if (edge === undefined) {
		throw new Error(`no Edge ${id} in the scene`);
	}
	return edge;
}

/** The length of the longest stretch two routes share. */
function longestShared(a: SceneEdge, b: SceneEdge): number {
	return Math.max(
		0,
		...sharedStretches(a.route, b.route).map(
			([from, to]) => Math.abs(to.x - from.x) + Math.abs(to.y - from.y),
		),
	);
}

describe("hops", () => {
	test("break the Edges that run across the direction, unless one of them hasn't room for the hop and every Edge along it has, or has more", () => {
		for (const direction of ["right", "down"] as const) {
			const scene = sceneOf(crowded(direction));
			// Each point where Edges with different targets cross, with the Edges
			// through it that run across the direction, and those that run along it.
			const points = new Map<
				string,
				{ point: Point; across: Map<SceneEdge, StraightRun>; along: Map<SceneEdge, StraightRun> }
			>();
			scene.edges.forEach((a, index) => {
				for (const b of scene.edges.slice(index + 1)) {
					if (targetOf(a) === targetOf(b)) {
						continue;
					}
					for (const { point, runs } of rightAngleCrossings(a, b)) {
						const key = `${point.x} ${point.y}`;
						const entry = points.get(key) ?? { point, across: new Map(), along: new Map() };
						for (const [edge, run] of [
							[a, runs[0]],
							[b, runs[1]],
						] as const) {
							(run.horizontal === (direction === "down") ? entry.across : entry.along).set(
								edge,
								run,
							);
						}
						points.set(key, entry);
					}
				}
			});
			/** The least room for a hop that the runs through a point leave on either side of it. */
			const room = (runs: Map<SceneEdge, StraightRun>, point: Point) =>
				Math.min(
					...[...runs.values()].map((run) => {
						const middle = run.horizontal ? point.x : point.y;
						return Math.min(middle - run.low, run.high - middle);
					}),
				);
			const half = scene.hop / 2;
			for (const { point, across, along } of points.values()) {
				const [acrossRoom, alongRoom] = [room(across, point), room(along, point)];
				// When neither side has room for the whole hop, the side with more room hops.
				const acrossHops = acrossRoom >= half || (alongRoom < half && acrossRoom >= alongRoom);
				if ((acrossHops ? acrossRoom : alongRoom) === 0) {
					continue;
				}
				const [hopping, whole] = acrossHops ? [across, along] : [along, across];
				for (const edge of hopping.keys()) {
					expect(brokenAt(edge, point), `${edge.id} hops at (${point.x}, ${point.y})`).toBe(true);
				}
				for (const edge of whole.keys()) {
					expect(brokenAt(edge, point), `${edge.id} runs on at (${point.x}, ${point.y})`).toBe(
						false,
					);
				}
			}
			expect(points.size, direction).toBeGreaterThan(100);
		}
	});

	test("are the same whatever order the Diagram declares its Edges in", () => {
		// Two regions keep their routes when the Edges come in reverse; the
		// crowded fixture doesn't, since declaration order breaks layout's ties.
		for (const direction of ["right", "down"] as const) {
			const fixture = twoRegions(direction);
			const strokes = (diagram: Diagram) =>
				Object.fromEntries(sceneOf(diagram).edges.map(({ id, stroke }) => [id, stroke]));
			const reversed: Diagram = { ...fixture, edges: [...fixture.edges].reverse() };
			expect(Object.values(strokes(fixture)).some((stroke) => stroke.length > 1)).toBe(true);
			expect(strokes(reversed)).toEqual(strokes(fixture));
		}
	});
});

describe("bundling", () => {
	const calls = ["web-app->gateway", "mobile-app->gateway", "partner-calls"];
	const fanOut = ["gateway->orders-api", "gateway->stock-api", "gateway->users-api"];
	const pairs = (ids: string[]) =>
		ids.flatMap((a, index) => ids.slice(index + 1).map((b) => [a, b]));
	/** The shortest of the longest stretches that each pair of these Edges shares: the trunk they have in common. */
	const trunkOf = (scene: Scene, ids: string[]) =>
		Math.min(
			...pairs(ids).map(([a = "", b = ""]) => longestShared(edgeOf(scene, a), edgeOf(scene, b))),
		);

	test("merges Edges of one Kind into one Port into a trunk, and keeps an Edge of another Kind in its own lane", () => {
		for (const diagram of [gateway, down(gateway)]) {
			const scene = sceneOf(diagram);
			const trunk = trunkOf(scene, calls);
			const events = edgeOf(scene, "partner-events");
			// The message meets the calls only where they all converge on the Port,
			// which is shorter than their trunk.
			for (const call of calls) {
				expect(sharedBeyondJunctions(events, edgeOf(scene, call)), call).toEqual([]);
				expect(longestShared(events, edgeOf(scene, call)), call).toBeLessThan(trunk);
			}
		}
	});

	test("can bundle Edges of one Kind out of one Port instead, so that Edges into one Port keep apart", () => {
		for (const diagram of [gateway, down(gateway)]) {
			const { scene } = render(diagram, { bundle: "source" });
			if (scene === undefined) {
				throw new Error("expected a scene");
			}
			const trunk = trunkOf(scene, fanOut);
			for (const [a = "", b = ""] of pairs(calls)) {
				const [first, second] = [edgeOf(scene, a), edgeOf(scene, b)];
				// The calls meet only where they converge on the gateway's Port, which is
				// shorter than the fan-out's trunk.
				expect(sharedBeyondJunctions(first, second), `${a} and ${b}`).toEqual([]);
				expect(longestShared(first, second), `${a} and ${b}`).toBeLessThan(trunk);
			}
		}
	});

	test("can bundle nothing, so that no two Edges share a lane beyond the junctions of their Ports", () => {
		for (const diagram of [gateway, down(gateway)]) {
			const { scene } = render(diagram, { bundle: "none" });
			if (scene === undefined) {
				throw new Error("expected a scene");
			}
			const edges = scene.edges;
			const shared = edges.flatMap((a, index) =>
				edges.slice(index + 1).flatMap((b) => lanesShared(a, b)),
			);
			expect(edges).toHaveLength(diagram.edges.length);
			expect(shared).toEqual([]);
		}
	});
});

/**
 * The Orders API, in a system, calls twelve workers below it. The shortest
 * routes all turn in the system's padding, below the API, which holds only a
 * few lanes.
 */
const fanOutOfAGroup = architecture({ title: "Fan-out", direction: "down" }, (d) => {
	d.group({ id: "core", kind: "system", title: "Core" }, (core) => {
		core.node({ id: "orders-api", kind: "service", title: "Orders API" });
	});
	for (let index = 1; index <= 12; index += 1) {
		d.node({ id: `worker-${index}`, kind: "worker", title: `Worker ${index}` });
		d.edge("orders-api", `worker-${index}`, { kind: "call" });
	}
});

/**
 * The most lanes that run side by side through a horizontal corridor, from
 * `top` to `bottom`, at any point along it, other than in the junction of a
 * Port: within its stub and room for a lane, a grid step, for each Edge at it.
 */
function lanesThrough(scene: Scene, top: number, bottom: number): number {
	const inJunctionOf = (point: Point) =>
		scene.edges.some(({ fromPort }) => {
			const count = scene.edges.filter((edge) => same(edge.fromPort.point, fromPort.point)).length;
			const reach =
				Math.abs(fromPort.stub.x - fromPort.point.x) +
				Math.abs(fromPort.stub.y - fromPort.point.y) +
				count * scene.grid;
			return Math.abs(point.x - fromPort.point.x) + Math.abs(point.y - fromPort.point.y) <= reach;
		});
	const runs = scene.edges.flatMap(({ route }) =>
		segmentsOf(route).filter(
			([a, b]) => a.y === b.y && top < a.y && a.y < bottom && !(inJunctionOf(a) && inJunctionOf(b)),
		),
	);
	const stops = runs.flatMap(([a, b]) => [a.x, b.x]);
	const middles = stops.flatMap((x, index) =>
		stops.slice(index + 1).map((other) => (x + other) / 2),
	);
	return Math.max(
		0,
		...middles.map(
			(x) =>
				new Set(
					runs
						.filter(([a, b]) => Math.min(a.x, b.x) < x && x < Math.max(a.x, b.x))
						.map(([a]) => a.y),
				).size,
		),
	);
}

function same(a: Point, b: Point): boolean {
	return a.x === b.x && a.y === b.y;
}

describe("a trunk", () => {
	test("counts once against capacity, so a bundle of more Edges than a corridor holds runs through it as one lane", () => {
		// Six jobs call the Orders API back, past a column of workers packed one
		// clearance apart, whose corridors hold four lanes each.
		const scene = sceneOf(
			architecture({ title: "Callbacks" }, (d) => {
				const api = d.node({ id: "orders-api", kind: "service", title: "Orders API" });
				for (let index = 1; index <= 6; index += 1) {
					const worker = d.node({
						id: `worker-${index}`,
						kind: "worker",
						title: `Worker ${index}`,
					});
					const job = d.node({ id: `job-${index}`, kind: "function", title: `Job ${index}` });
					d.edge(api, worker, { kind: "message" });
					d.edge(worker, job, { kind: "message" });
					d.edge(job, api, { kind: "call" });
				}
			}),
		);
		const workers = scene.nodes.filter(({ id }) => id.startsWith("worker-")).map(({ box }) => box);
		const top = Math.min(...workers.map((box) => box.y));
		const bottom = Math.max(...workers.map((box) => box.y + box.height));
		const [left = 0, right = 0] = [workers[0]?.x, (workers[0]?.x ?? 0) + (workers[0]?.width ?? 0)];
		const callbacks = scene.edges.filter(({ to }) => to === "orders-api");
		const crossings = callbacks.map(({ route }) =>
			segmentsOf(route).find(
				([a, b]) => a.y === b.y && Math.min(a.x, b.x) <= left && Math.max(a.x, b.x) >= right,
			),
		);
		// Every callback crosses the column between two workers, all in one lane.
		expect(new Set(crossings.map((segment) => segment?.[0].y)).size).toBe(1);
		const y = crossings[0]?.[0].y ?? 0;
		expect(y).toBeGreaterThan(top);
		expect(y).toBeLessThan(bottom);
	});
});

describe("an overfull corridor", () => {
	test("has its Edges routed again, with a lasting cost on each segment left over capacity, until they fit", () => {
		expect(overfullCorridors(sceneOf(crossTalk))).toEqual([]);
	});
});

describe("a wide fan-out out of a Group", () => {
	test("spreads where there's room for its lanes, not along the Group's padding", () => {
		const scene = sceneOf(fanOutOfAGroup);
		const api = nodeOf(scene, "orders-api").box;
		const core = scene.groups[0]?.box ?? scene.bounds;
		const width = core.y + core.height - (api.y + api.height);
		expect(lanesThrough(scene, api.y + api.height, core.y + core.height)).toBeLessThanOrEqual(
			width / scene.lanes.spacing,
		);
		expect(overfullCorridors(scene)).toEqual([]);
	});
});

describe("a narrow corridor", () => {
	test("squeezes its lanes below the preferred spacing, but no closer than the minimum, and keeps each the padding from its sides", () => {
		const scene = sceneOf(crossTalk);
		const { spacing, minimum } = scene.lanes;
		// Somewhere two lanes of different bundles run side by side closer than
		// the preferred spacing: the squeeze.
		const squeezed = scene.edges.some((a, index) =>
			scene.edges.slice(index + 1).some((b) =>
				segmentsOf(a.route).some(([a1, a2]) =>
					segmentsOf(b.route).some(([b1, b2]) => {
						const horizontal = a1.y === a2.y;
						if (sameBundle(a, b) || horizontal !== (b1.y === b2.y)) {
							return false;
						}
						const gap = horizontal ? Math.abs(a1.y - b1.y) : Math.abs(a1.x - b1.x);
						const [p, q] = horizontal
							? [
									[a1.x, a2.x],
									[b1.x, b2.x],
								]
							: [
									[a1.y, a2.y],
									[b1.y, b2.y],
								];
						const overlap =
							Math.min(Math.max(...(p ?? [])), Math.max(...(q ?? []))) -
							Math.max(Math.min(...(p ?? [])), Math.min(...(q ?? [])));
						return gap >= minimum && gap < spacing && overlap > sameLane;
					}),
				),
			),
		);
		expect(squeezed).toBe(true);
		expect(tooClose(scene)).toEqual([]);
	});
});

describe("parallel Edges", () => {
	/** The Orders API calls the Payments API three ways, and messages it once: four Edges between one pair of Ports. */
	const parallels = (direction: Direction) =>
		architecture({ title: "Parallel", direction }, (d) => {
			const orders = d.node({ id: "orders-api", kind: "service", title: "Orders API" });
			const payments = d.node({ id: "payments-api", kind: "service", title: "Payments API" });
			const db = d.node({ id: "payments-db", kind: "database", title: "Payments DB" });
			for (const id of ["charge", "refund", "capture"]) {
				d.edge(orders, payments, { kind: "call", id });
			}
			d.edge(orders, payments, { kind: "message", id: "payment-events" });
			d.edge(payments, db, { kind: "call" });
		});

	test("never share a trunk or any stretch of lane, and run apart from one Port's junction to the other's", () => {
		for (const direction of ["right", "down"] as const) {
			const scene = sceneOf(parallels(direction));
			const between = scene.edges.filter(({ to }) => to === "payments-api");
			expect(between).toHaveLength(4);
			for (const [index, a] of between.entries()) {
				for (const b of between.slice(index + 1)) {
					expect(parallel(a, b)).toBe(true);
					expect(sharedBeyondJunctions(a, b), `${a.id} and ${b.id}`).toEqual([]);
					// Beyond their junctions, each keeps a lane of its own, the minimum spacing apart.
					const inner = (edge: SceneEdge) => edge.route.slice(1, -1);
					expect(sharedStretches(inner(a), inner(b)), `${a.id} and ${b.id}`).toEqual([]);
				}
			}
			expect(tooClose(scene)).toEqual([]);
			// Each runs from its source's junction to its target's in a lane of its
			// own, so no two of them are level along their middle runs.
			const middles = between.map(({ route }) => {
				const middle = route[Math.floor(route.length / 2)];
				return direction === "right" ? middle?.y : middle?.x;
			});
			expect(new Set(middles).size).toBe(between.length);
		}
	});
});

describe("Edges that share a corridor", () => {
	test("spread into lanes that don't cross, when they fan out from one Port", () => {
		for (const direction of ["right", "down"] as const) {
			const scene = sceneOf(
				architecture({ title: "Fan-out", direction }, (d) => {
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
			const crossings = scene.edges.flatMap((a, index) =>
				scene.edges
					.slice(index + 1)
					.filter((b) => crossingsBetween(a.route, b.route) > 0)
					.map((b) => `${a.id} crosses ${b.id}`),
			);
			expect(crossings, direction).toEqual([]);
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

describe("an Edge attached to a Row that the search can't route", () => {
	test("still leaves and enters along its Ports' stubs, in horizontal and vertical runs, and the core warns", () => {
		for (const diagram of [rows, down(rows)]) {
			const { scene, diagnostics } = render(diagram, { searchBudget: 1 });
			expect(diagnostics.map(({ rule, pointer }) => [rule, pointer])).toEqual(
				diagram.edges.map((_, index) => ["fallback-route", `/edges/${index}`]),
			);
			for (const { id, route, fromPort, toPort } of scene?.edges ?? []) {
				const [first, second] = route;
				expect(first && at(first), id).toEqual(fromPort.point);
				expect(onSegment(fromPort.stub, first, second), `${id} leaves off its stub`).toBe(true);
				const [beforeLast, last] = route.slice(-2);
				expect(last && at(last), id).toEqual(toPort.point);
				expect(onSegment(toPort.stub, beforeLast, last), `${id} enters off its stub`).toBe(true);
				const runs = segmentsOf(route).map(([a, b]) => {
					expect(a.x === b.x || a.y === b.y, `${id} has a slanted segment`).toBe(true);
					expect(a.x !== b.x || a.y !== b.y, `${id} has an empty segment`).toBe(true);
					return a.y === b.y ? "horizontal" : "vertical";
				});
				runs.slice(1).forEach((run, index) => {
					expect(run, `${id} has two ${run} runs in a row`).not.toBe(runs[index]);
				});
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
