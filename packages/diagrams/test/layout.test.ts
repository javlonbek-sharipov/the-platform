import { describe, expect, test } from "vitest";
import {
	type ArchitectureBuilder,
	architecture,
	type Box,
	type Diagram,
	type Direction,
	type Point,
	render,
	type Scene,
} from "../src/index.ts";

const directions: Direction[] = ["right", "down"];

/** The rank axis runs along the direction, and the order axis across it. */
const axes = {
	right: { rank: "x", order: "y" },
	down: { rank: "y", order: "x" },
} as const;

type Axis = "x" | "y";

function start(box: Box, axis: Axis): number {
	return axis === "x" ? box.x : box.y;
}

function end(box: Box, axis: Axis): number {
	return axis === "x" ? box.x + box.width : box.y + box.height;
}

function middle(box: Box, axis: Axis): number {
	return (start(box, axis) + end(box, axis)) / 2;
}

function sceneOf(diagram: unknown): Scene {
	const { scene, diagnostics } = render(diagram);
	expect(diagnostics).toEqual([]);
	if (scene === undefined) {
		throw new Error("expected a scene");
	}
	return scene;
}

function boxOf(scene: Scene, id: string): Box {
	const node = scene.nodes.find((candidate) => candidate.id === id);
	if (node === undefined) {
		throw new Error(`no Node ${id} in the scene`);
	}
	return node.box;
}

function diagram(
	title: string,
	direction: Direction,
	build: (d: ArchitectureBuilder) => void,
): Diagram {
	return architecture({ id: "test", title, direction }, build);
}

/** web-app → shop-api → shop-db */
function chain(direction: Direction): Diagram {
	return diagram("Chain", direction, (d) => {
		const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
		const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
		const db = d.node({ id: "shop-db", kind: "database", title: "Shop database" });
		d.edge(web, api, { kind: "call" });
		d.edge(api, db, { kind: "call" });
	});
}

/** orders-api → orders-db, orders-cache, orders-search */
function fanOut(direction: Direction, targets = ["orders-db", "orders-cache", "orders-search"]) {
	return diagram("Fan-out", direction, (d) => {
		const api = d.node({ id: "orders-api", kind: "service", title: "Orders API" });
		for (const id of targets) {
			d.node({ id, kind: "database", title: id });
			d.edge(api, id, { kind: "call" });
		}
	});
}

/** web-app, mobile-app, partner-api → api-gateway */
function fanIn(direction: Direction): Diagram {
	return diagram("Fan-in", direction, (d) => {
		const gateway = d.node({ id: "api-gateway", kind: "gateway", title: "API gateway" });
		for (const id of ["web-app", "mobile-app", "partner-api"]) {
			d.node({ id, kind: "client", title: id });
			d.edge(id, gateway, { kind: "call" });
		}
	});
}

/** api-gateway → orders-api and stock-api, which both → shop-db */
function diamond(direction: Direction): Diagram {
	return diagram("Diamond", direction, (d) => {
		const gateway = d.node({ id: "api-gateway", kind: "gateway", title: "API gateway" });
		const orders = d.node({ id: "orders-api", kind: "service", title: "Orders API" });
		const stock = d.node({ id: "stock-api", kind: "service", title: "Stock API" });
		const db = d.node({ id: "shop-db", kind: "database", title: "Shop database" });
		d.edge(gateway, orders, { kind: "call" });
		d.edge(gateway, stock, { kind: "call" });
		d.edge(orders, db, { kind: "call" });
		d.edge(stock, db, { kind: "call" });
	});
}

/** orders-api → payments-api → ledger → orders-api, and a self-loop on the ledger */
function cycle(direction: Direction): Diagram {
	return diagram("Cycle", direction, (d) => {
		const orders = d.node({ id: "orders-api", kind: "service", title: "Orders API" });
		const payments = d.node({ id: "payments-api", kind: "service", title: "Payments API" });
		const ledger = d.node({ id: "ledger", kind: "worker", title: "Ledger" });
		d.edge(orders, payments, { kind: "call" });
		d.edge(payments, ledger, { kind: "message" });
		d.edge(ledger, orders, { kind: "message" });
		d.edge(ledger, ledger, { kind: "message" });
	});
}

/** web-app → shop-api, and, unconnected to them, mail-queue → mailer */
function twoParts(direction: Direction): Diagram {
	return diagram("Two parts", direction, (d) => {
		const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
		const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
		const queue = d.node({ id: "mail-queue", kind: "queue", title: "Mail queue" });
		const mailer = d.node({ id: "mailer", kind: "worker", title: "Mailer" });
		d.edge(web, api, { kind: "call" });
		d.edge(queue, mailer, { kind: "message" });
	});
}

/**
 * Three clients, each calling its own backend. The backends are declared in
 * the opposite order, so stacking each rank in declaration order would make
 * all three Edges cross each other: three crossings.
 */
function crossedBackends(direction: Direction): Diagram {
	return diagram("Backends", direction, (d) => {
		const clients = ["web-app", "mobile-app", "admin-app"].map((id) =>
			d.node({ id, kind: "client", title: id }),
		);
		const backends = ["admin-api", "mobile-bff", "web-bff"].map((id) =>
			d.node({ id, kind: "service", title: id }),
		);
		clients.forEach((client, index) => {
			d.edge(client, backends[2 - index] ?? client, { kind: "call" });
		});
	});
}

/**
 * Three clients and two backends. In declaration order, two pairs of Edges
 * cross. Reordering the backends alone still leaves one crossing; only
 * moving the admin app between the other two clients removes them all.
 */
function crossedClients(direction: Direction): Diagram {
	return diagram("Clients", direction, (d) => {
		const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
		const mobile = d.node({ id: "mobile-app", kind: "client", title: "Mobile app" });
		const admin = d.node({ id: "admin-app", kind: "client", title: "Admin app" });
		const accounts = d.node({ id: "accounts-api", kind: "service", title: "Accounts API" });
		const catalog = d.node({ id: "catalog-api", kind: "service", title: "Catalog API" });
		d.edge(web, catalog, { kind: "call" });
		d.edge(mobile, accounts, { kind: "call" });
		d.edge(admin, accounts, { kind: "call" });
		d.edge(admin, catalog, { kind: "call" });
	});
}

/**
 * How many pairs of Edges cross, drawing each Edge as a straight line from
 * its source's output Port to its target's input Port.
 */
function crossings(scene: Scene): number {
	const portsOf = (edge: Scene["edges"][number]) => {
		const from = scene.nodes.find((node) => node.id === edge.from);
		const to = scene.nodes.find((node) => node.id === edge.to);
		if (from === undefined || to === undefined) {
			throw new Error(`no Nodes for ${edge.id}`);
		}
		return [from.output.point, to.input.point] as const;
	};
	const turn = (a: Point, b: Point, c: Point) =>
		Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
	const lines = scene.edges.filter((edge) => edge.from !== edge.to).map(portsOf);
	let count = 0;
	for (const [index, [a, b]] of lines.entries()) {
		for (const [c, d] of lines.slice(index + 1)) {
			if (turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0) {
				count += 1;
			}
		}
	}
	return count;
}

/**
 * The web app calls two APIs, each with its own database, and also reads the
 * orders database directly. That last Edge skips the APIs' rank, and passes
 * it between the two APIs without crossing anything.
 */
function skippingEdge(direction: Direction, skips = true): Diagram {
	return diagram("Skipping", direction, (d) => {
		const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
		const orders = d.node({ id: "orders-api", kind: "service", title: "Orders API" });
		const stock = d.node({ id: "stock-api", kind: "service", title: "Stock API" });
		const ordersDb = d.node({ id: "orders-db", kind: "database", title: "Orders database" });
		const stockDb = d.node({ id: "stock-db", kind: "database", title: "Stock database" });
		d.edge(web, orders, { kind: "call" });
		d.edge(web, stock, { kind: "call" });
		d.edge(orders, ordersDb, { kind: "call" });
		d.edge(stock, stockDb, { kind: "call" });
		if (skips) {
			d.edge(web, ordersDb, { kind: "call" });
		}
	});
}

/** Whether an Edge runs straight: its two Ports are level across the ranks. */
function straight(scene: Scene, from: string, to: string): boolean {
	const source = scene.nodes.find((node) => node.id === from);
	const target = scene.nodes.find((node) => node.id === to);
	if (source === undefined || target === undefined) {
		throw new Error(`no Nodes ${from} and ${to}`);
	}
	const [a, b] = [source.output.point, target.input.point];
	return source.output.side === "right" ? a.y === b.y : a.x === b.x;
}

/**
 * Two calls that cross in declaration order, with an unconnected Node
 * declared between their sources.
 */
function crossingBesideUnconnected(direction: Direction): Diagram {
	return diagram("Crossing", direction, (d) => {
		const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
		d.node({ id: "docs-site", kind: "client", title: "Docs site" });
		const mobileApi = d.node({ id: "mobile-api", kind: "service", title: "Mobile API" });
		const mobile = d.node({ id: "mobile-app", kind: "client", title: "Mobile app" });
		const webApi = d.node({ id: "web-api", kind: "service", title: "Web API" });
		d.edge(mobile, mobileApi, { kind: "call" });
		d.edge(web, webApi, { kind: "call" });
	});
}

/** Each fixture, with the Edges that close a cycle in it. */
const fixtures: [string, (direction: Direction) => Diagram, string[]][] = [
	["a chain", chain, []],
	["a fan-out", (direction) => fanOut(direction), []],
	["a fan-in", fanIn, []],
	["a diamond", diamond, []],
	["a cycle", cycle, ["ledger->orders-api", "ledger->ledger"]],
	["two disconnected parts", twoParts, []],
	["crossing Edges beside an unconnected Node", crossingBesideUnconnected, []],
];

describe.each(directions)("a Diagram laid out %s", (direction) => {
	const { rank, order } = axes[direction];

	test("puts each rank after the one before it, along the direction", () => {
		const scene = sceneOf(chain(direction));
		const web = boxOf(scene, "web-app");
		const api = boxOf(scene, "shop-api");
		const db = boxOf(scene, "shop-db");

		expect(start(api, rank)).toBeGreaterThan(end(web, rank));
		expect(start(db, rank)).toBeGreaterThan(end(api, rank));
	});

	test("puts each Node in the rank of the longest path that reaches it", () => {
		// The shortest path to `report-store` has one Edge; the longest has two.
		const scene = sceneOf(
			diagram("Reports", direction, (d) => {
				const api = d.node({ id: "reports-api", kind: "service", title: "Reports API" });
				const jobs = d.node({ id: "report-jobs", kind: "worker", title: "Report jobs" });
				const store = d.node({ id: "report-store", kind: "storage", title: "Report store" });
				d.edge(api, store, { kind: "call" });
				d.edge(api, jobs, { kind: "message" });
				d.edge(jobs, store, { kind: "call" });
			}),
		);

		const api = boxOf(scene, "reports-api");
		const jobs = boxOf(scene, "report-jobs");
		const store = boxOf(scene, "report-store");
		expect(start(jobs, rank)).toBeGreaterThan(end(api, rank));
		expect(start(store, rank)).toBeGreaterThan(end(jobs, rank));
	});

	test("searches for cycles from the first-declared Node, so the Edge back to it closes the cycle", () => {
		const ranksAlong = (first: "orders-api" | "ledger") => {
			const scene = sceneOf(
				diagram("Cycle", direction, (d) => {
					const ids = ["orders-api", "payments-api", "ledger"];
					for (const id of [first, ...ids.filter((id) => id !== first)]) {
						d.node({ id, kind: "service", title: id });
					}
					d.edge("orders-api", "payments-api", { kind: "call" });
					d.edge("payments-api", "ledger", { kind: "message" });
					d.edge("ledger", "orders-api", { kind: "message" });
				}),
			);
			expect(scene.edges).toHaveLength(3);
			return scene.nodes
				.map((node) => [node.id, start(node.box, rank)] as const)
				.sort(([, a], [, b]) => a - b)
				.map(([id]) => id);
		};

		expect(ranksAlong("orders-api")).toEqual(["orders-api", "payments-api", "ledger"]);
		expect(ranksAlong("ledger")).toEqual(["ledger", "orders-api", "payments-api"]);
	});

	test("ignores self-loops, and counts parallel Edges once", () => {
		const scene = sceneOf(
			diagram("Loops", direction, (d) => {
				const api = d.node({ id: "orders-api", kind: "service", title: "Orders API" });
				const db = d.node({ id: "orders-db", kind: "database", title: "Orders database" });
				d.edge(api, api, { kind: "message" });
				d.edge(api, db, { kind: "call", id: "read" });
				d.edge(api, db, { kind: "call", id: "write" });
				d.edge(db, db, { kind: "message" });
			}),
		);

		const api = boxOf(scene, "orders-api");
		const db = boxOf(scene, "orders-db");
		expect(start(db, rank)).toBeGreaterThan(end(api, rank));
		const width = end(db, rank) - start(api, rank);
		expect(width).toBe(
			end(boxOf(sceneOf(fanOut(direction, ["orders-db"])), "orders-db"), rank) -
				start(boxOf(sceneOf(fanOut(direction, ["orders-db"])), "orders-api"), rank),
		);
	});

	test("reorders a rank to remove the crossings that declaration order would make", () => {
		expect(crossings(sceneOf(crossedBackends(direction)))).toBe(0);
	});

	test("reorders the first rank too, when only that removes the crossings", () => {
		expect(crossings(sceneOf(crossedClients(direction)))).toBe(0);
	});

	test("makes room in each rank that an Edge skips, where it crosses nothing", () => {
		const gapBetweenApis = (scene: Scene) =>
			start(boxOf(scene, "stock-api"), order) - end(boxOf(scene, "orders-api"), order);

		const withSkip = sceneOf(skippingEdge(direction));
		const withoutSkip = sceneOf(skippingEdge(direction, false));
		expect(gapBetweenApis(withSkip)).toBeGreaterThan(gapBetweenApis(withoutSkip));
	});

	test("swaps two unconnected Nodes of one rank when their declaration order is swapped", () => {
		const across = (scene: Scene, id: string) => start(boxOf(scene, id), order);
		const isolated = (ids: string[]) =>
			sceneOf(
				diagram("Isolated", direction, (d) => {
					for (const id of ids) {
						d.node({ id, kind: "service", title: id });
					}
				}),
			);

		const declared = isolated(["orders-api", "stock-api"]);
		const swapped = isolated(["stock-api", "orders-api"]);
		expect(across(declared, "orders-api")).toBeLessThan(across(declared, "stock-api"));
		expect(across(swapped, "stock-api")).toBe(across(declared, "orders-api"));
		expect(across(swapped, "orders-api")).toBe(across(declared, "stock-api"));

		const targets = sceneOf(fanOut(direction, ["orders-db", "orders-cache", "orders-search"]));
		const reversed = sceneOf(fanOut(direction, ["orders-search", "orders-cache", "orders-db"]));
		expect(across(targets, "orders-db")).toBeLessThan(across(targets, "orders-cache"));
		expect(across(targets, "orders-cache")).toBeLessThan(across(targets, "orders-search"));
		expect(across(reversed, "orders-search")).toBe(across(targets, "orders-db"));
		expect(across(reversed, "orders-cache")).toBe(across(targets, "orders-cache"));
		expect(across(reversed, "orders-db")).toBe(across(targets, "orders-search"));
	});

	test("keeps a chain straight", () => {
		const scene = sceneOf(chain(direction));
		expect(straight(scene, "web-app", "shop-api")).toBe(true);
		expect(straight(scene, "shop-api", "shop-db")).toBe(true);
	});

	test("lines a Node up with the middle one of three it fans out to, or that fan into it", () => {
		const out = sceneOf(fanOut(direction));
		expect(
			["orders-db", "orders-cache", "orders-search"].map((id) => straight(out, "orders-api", id)),
		).toEqual([false, true, false]);

		const into = sceneOf(fanIn(direction));
		expect(
			["web-app", "mobile-app", "partner-api"].map((id) => straight(into, id, "api-gateway")),
		).toEqual([false, true, false]);
	});

	test("keeps one straight path through a diamond", () => {
		const scene = sceneOf(diamond(direction));
		const through = ["orders-api", "stock-api"].filter(
			(middle) => straight(scene, "api-gateway", middle) && straight(scene, middle, "shop-db"),
		);
		expect(through).toEqual(["orders-api"]);
	});

	test("centers the members of each rank on the rank's line", () => {
		const scene = sceneOf(fanOut(direction));
		const lines = ["orders-db", "orders-cache", "orders-search"].map((id) =>
			middle(boxOf(scene, id), rank),
		);
		expect(new Set(lines).size).toBe(1);
	});

	describe.each(fixtures)("on %s", (_, fixture, closing) => {
		test("keeps every Node out of every other Node's clearance", () => {
			const scene = sceneOf(fixture(direction));
			const { clearance } = scene;
			expect(clearance).toBeGreaterThan(0);
			for (const [index, a] of scene.nodes.entries()) {
				for (const b of scene.nodes.slice(index + 1)) {
					const gaps = (["x", "y"] as const).map((axis) =>
						Math.max(start(b.box, axis) - end(a.box, axis), start(a.box, axis) - end(b.box, axis)),
					);
					expect(Math.max(...gaps), `${a.id} and ${b.id}`).toBeGreaterThanOrEqual(clearance);
				}
			}
		});

		test("snaps every Node's corners and Ports to the grid", () => {
			const scene = sceneOf(fixture(direction));
			const { grid } = scene;
			expect(grid).toBeGreaterThan(0);
			for (const { id, box, input, output } of scene.nodes) {
				const points = [
					{ x: box.x, y: box.y },
					{ x: box.x + box.width, y: box.y + box.height },
					input.point,
					output.point,
				];
				for (const { x, y } of points) {
					expect([x % grid, y % grid], id).toEqual([0, 0]);
				}
			}
		});

		test("ranks every Edge's target after its source, except Edges that close a cycle", () => {
			const scene = sceneOf(fixture(direction));
			for (const edge of scene.edges.filter(({ id }) => !closing.includes(id))) {
				expect(start(boxOf(scene, edge.to), rank), edge.id).toBeGreaterThan(
					end(boxOf(scene, edge.from), rank),
				);
			}
			for (const id of closing) {
				expect(scene.edges.map((edge) => edge.id)).toContain(id);
			}
		});
	});
});

describe("Ports", () => {
	test("sit on the left and right sides for right, level with the header", () => {
		for (const { box, input, output } of sceneOf(chain("right")).nodes) {
			expect(input).toEqual({ side: "left", point: { x: box.x, y: input.point.y } });
			expect(output).toEqual({ side: "right", point: { x: box.x + box.width, y: input.point.y } });
			expect(input.point.y).toBeGreaterThan(box.y);
			expect(input.point.y).toBeLessThan(box.y + box.height);
		}
	});

	test("sit on top for input and at the bottom for output, for down", () => {
		for (const { box, input, output } of sceneOf(chain("down")).nodes) {
			const center = box.x + box.width / 2;
			expect(input).toEqual({ side: "top", point: { x: center, y: box.y } });
			expect(output).toEqual({ side: "bottom", point: { x: center, y: box.y + box.height } });
		}
	});
});
