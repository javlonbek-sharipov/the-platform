import { describe, expect, test } from "vitest";
import {
	type ArchitectureBuilder,
	architecture,
	type Box,
	type Diagram,
	type Direction,
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

/** Each fixture, with the Edges that close a cycle in it. */
const fixtures: [string, (direction: Direction) => Diagram, string[]][] = [
	["a chain", chain, []],
	["a fan-out", (direction) => fanOut(direction), []],
	["a fan-in", fanIn, []],
	["a diamond", diamond, []],
	["a cycle", cycle, ["ledger->orders-api", "ledger->ledger"]],
	["two disconnected parts", twoParts, []],
];

describe.each(directions)("a Diagram laid out %s", (direction) => {
	const { rank } = axes[direction];

	test("puts each rank after the one before it, along the direction", () => {
		const scene = sceneOf(chain(direction));
		const web = boxOf(scene, "web-app");
		const api = boxOf(scene, "shop-api");
		const db = boxOf(scene, "shop-db");

		expect(start(api, rank)).toBeGreaterThan(end(web, rank));
		expect(start(db, rank)).toBeGreaterThan(end(api, rank));
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
