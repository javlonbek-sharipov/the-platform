import { describe, expect, test } from "vitest";
import { architecture, render, type Scene, type SceneNode } from "../src/index.ts";

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

function sceneOf(diagram: unknown): Scene {
	const { scene } = render(diagram);
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

describe("the minimal route", () => {
	test("leaves from the right side, and enters at the left side, level with the header", () => {
		for (const node of sceneOf(shop).nodes) {
			const { box, input, output } = node;
			expect(input).toEqual({ side: "left", point: { x: box.x, y: input.point.y } });
			expect(output).toEqual({ side: "right", point: { x: box.x + box.width, y: input.point.y } });
			expect(input.point.y).toBeGreaterThan(box.y);
			expect(input.point.y).toBeLessThan(box.y + box.height);
		}
	});

	test("joins the source's output Port to the target's input Port", () => {
		const scene = sceneOf(shop);
		for (const edge of scene.edges) {
			expect(edge.route.at(0)).toEqual(nodeOf(scene, edge.from).output.point);
			expect(edge.route.at(-1)).toEqual(nodeOf(scene, edge.to).input.point);
		}
	});

	test("is a straight line, or makes a single bend", () => {
		const scene = sceneOf(shop);
		const shapes = scene.edges.map((edge) => {
			edge.route.slice(1).forEach((point, index) => {
				const previous = edge.route[index];
				const straight = point.x === previous?.x || point.y === previous?.y;
				expect(straight, `${edge.id} has a slanted segment`).toBe(true);
			});
			return [edge.id, edge.route.length === 2 ? "straight" : `${edge.route.length - 2} bend`];
		});

		// Layout lines the shop API up with its database, and the mailer with the events queue.
		expect(shapes).toEqual([
			["web-app->shop-api", "straight"],
			["shop-api->shop-db", "straight"],
			["shop-api->shop-events", "1 bend"],
			["shop-events->mailer", "straight"],
		]);
	});
});
