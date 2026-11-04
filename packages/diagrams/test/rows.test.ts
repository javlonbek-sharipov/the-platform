import { describe, expect, test } from "vitest";
import {
	architecture,
	type Diagram,
	type Direction,
	render,
	type Scene,
	type SceneNode,
	type SceneText,
} from "../src/index.ts";

const directions: Direction[] = ["right", "down"];

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

/** Where a piece of text starts and ends, drawn centered on its point. */
function extent(text: SceneText): { left: number; right: number } {
	return { left: text.point.x - text.width / 2, right: text.point.x + text.width / 2 };
}

/** The Orders database alone, with the first `count` of its Rows. */
function database(direction: Direction, count: number): Diagram {
	const rows = [
		{ name: "replicas", value: "3" },
		{ name: "region", value: "eu-west-1" },
		{ name: "engine", value: "Postgres 17" },
	];
	return architecture({ title: "Rows", direction }, (d) => {
		d.node({
			id: "orders-db",
			kind: "database",
			title: "Orders database",
			rows: rows.slice(0, count),
		});
	});
}

describe.each(directions)("Rows on a Diagram laid out %s", (direction) => {
	test("each add a band to their Node's height, below its header", () => {
		const [plain, ...withRows] = [0, 1, 2, 3].map((count) =>
			nodeOf(sceneOf(database(direction, count)), "orders-db"),
		);
		if (plain === undefined) {
			throw new Error("expected a Node without Rows");
		}
		const band = (withRows[0]?.box.height ?? 0) - plain.box.height;
		expect(band).toBeGreaterThan(0);
		withRows.forEach((node, index) => {
			expect(node.box.width).toBe(plain.box.width);
			expect(node.box.height).toBe(plain.box.height + (index + 1) * band);
			// The header keeps its height, and its title its place.
			expect(node.title.point.y - node.box.y).toBe(plain.title.point.y - plain.box.y);
			expect(node.rows).toHaveLength(index + 1);
			node.rows.forEach((row, at) => {
				const top = node.box.y + plain.box.height + at * band;
				expect(row.box).toEqual({ x: node.box.x, y: top, width: node.box.width, height: band });
			});
		});
	});

	test("show their names on the left and their values on the right, each Row level within its band", () => {
		const node = nodeOf(sceneOf(database(direction, 3)), "orders-db");
		const names = node.rows.map((row) => row.name);
		const values = node.rows.map((row) => row.value);
		expect(names.map((name) => name.text)).toEqual(["replicas", "region", "engine"]);
		expect(values.map((value) => value?.text)).toEqual(["3", "eu-west-1", "Postgres 17"]);

		const middle = node.box.x + node.box.width / 2;
		for (const [index, { box, name, value }] of node.rows.entries()) {
			if (value === undefined) {
				throw new Error("expected a value");
			}
			expect(name.point.y).toBe(value.point.y);
			expect(name.point.y).toBeGreaterThan(box.y);
			expect(name.point.y).toBeLessThan(box.y + box.height);
			// Names line up on the left, and values on the right.
			expect(extent(name).left).toBe(extent(names[0] ?? name).left);
			expect(extent(value).right).toBe(extent(values[0] ?? value).right);
			expect(extent(name).left, `Row ${index}`).toBeGreaterThan(node.box.x);
			expect(extent(name).left, `Row ${index}`).toBeLessThan(middle);
			expect(extent(value).right, `Row ${index}`).toBeGreaterThan(middle);
			expect(extent(value).right, `Row ${index}`).toBeLessThan(node.box.x + node.box.width);
			expect(extent(name).right).toBeLessThan(extent(value).left);
			for (const text of [name, value]) {
				expect(text.weight).toBe("regular");
				expect(text.shortened).toBe(false);
			}
		}
	});
});
