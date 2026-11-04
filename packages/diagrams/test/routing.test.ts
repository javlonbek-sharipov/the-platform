import { describe, expect, test } from "vitest";
import {
	architecture,
	type Box,
	type Diagram,
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

/** The same Diagram, drawn top to bottom. */
function down(diagram: Diagram): Diagram {
	return { ...diagram, direction: "down" };
}

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

describe("the minimal route", () => {
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

		expect(shapes).toEqual([
			["web-app->shop-api", "straight"],
			["shop-api->shop-db", "straight"],
			["shop-api->shop-events", "1 bend"],
			["shop-events->mailer", "1 bend"],
		]);
	});
});
