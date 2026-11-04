import { describe, expect, test } from "vitest";
import { architecture, type Box, render, type Scene } from "../src/index.ts";

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

describe("the minimal layout", () => {
	test("puts each Node in the rank of the longest path that reaches it", () => {
		// The shortest path to `report` has one Edge; the longest has two.
		const scene = sceneOf(
			architecture({ title: "Reports" }, (d) => {
				const api = d.node({ id: "reports-api", kind: "service", title: "Reports API" });
				const jobs = d.node({ id: "report-jobs", kind: "worker", title: "Report jobs" });
				const store = d.node({ id: "report-store", kind: "storage", title: "Report store" });
				d.edge(api, jobs, { kind: "message" });
				d.edge(jobs, store, { kind: "call" });
				d.edge(api, store, { kind: "call" });
			}),
		);

		const api = boxOf(scene, "reports-api");
		const jobs = boxOf(scene, "report-jobs");
		const store = boxOf(scene, "report-store");
		expect(api.x + api.width).toBeLessThan(jobs.x);
		expect(jobs.x + jobs.width).toBeLessThan(store.x);
	});

	test("stacks each rank in declaration order", () => {
		const fanOut = (order: string[]) =>
			sceneOf(
				architecture({ title: "Fan-out" }, (d) => {
					const api = d.node({ id: "orders-api", kind: "service", title: "Orders API" });
					for (const id of order) {
						d.node({ id, kind: "database", title: id });
						d.edge(api, id, { kind: "call" });
					}
				}),
			);

		const declared = fanOut(["orders-db", "orders-cache", "orders-search"]);
		const db = boxOf(declared, "orders-db");
		const cache = boxOf(declared, "orders-cache");
		const search = boxOf(declared, "orders-search");
		expect([db.x, cache.x]).toEqual([search.x, search.x]);
		expect(db.y + db.height).toBeLessThan(cache.y);
		expect(cache.y + cache.height).toBeLessThan(search.y);

		const reversed = fanOut(["orders-search", "orders-cache", "orders-db"]);
		expect(boxOf(reversed, "orders-search").y).toBe(db.y);
		expect(boxOf(reversed, "orders-db").y).toBe(search.y);
	});

	test("never overlaps two Nodes", () => {
		const scene = sceneOf(
			architecture({ title: "Busy" }, (d) => {
				const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
				const mobile = d.node({ id: "mobile-app", kind: "client", title: "Mobile app" });
				const gateway = d.node({ id: "api-gateway", kind: "gateway", title: "API gateway" });
				const orders = d.node({ id: "orders", kind: "service", title: "Orders" });
				const stock = d.node({ id: "stock", kind: "service", title: "Stock" });
				const db = d.node({ id: "orders-db", kind: "database", title: "Orders database" });
				d.edge(web, gateway, { kind: "call" });
				d.edge(mobile, gateway, { kind: "call" });
				d.edge(gateway, orders, { kind: "call" });
				d.edge(gateway, stock, { kind: "call" });
				d.edge(orders, db, { kind: "call" });
				d.edge(stock, orders, { kind: "message" });
			}),
		);

		for (const [index, a] of scene.nodes.entries()) {
			for (const b of scene.nodes.slice(index + 1)) {
				const apart =
					a.box.x + a.box.width <= b.box.x ||
					b.box.x + b.box.width <= a.box.x ||
					a.box.y + a.box.height <= b.box.y ||
					b.box.y + b.box.height <= a.box.y;
				expect(apart, `${a.id} and ${b.id} overlap`).toBe(true);
			}
		}
	});

	test("still lays out a Diagram with a cycle and a self-loop", () => {
		const scene = sceneOf(
			architecture({ title: "Cycle" }, (d) => {
				const a = d.node({ id: "ping", kind: "service", title: "Ping" });
				const b = d.node({ id: "pong", kind: "service", title: "Pong" });
				d.edge(a, b, { kind: "call" });
				d.edge(b, a, { kind: "call" });
				d.edge(a, a, { kind: "message" });
			}),
		);

		expect(boxOf(scene, "ping").x).toBeLessThan(boxOf(scene, "pong").x);
		expect(scene.edges).toHaveLength(3);
	});
});
