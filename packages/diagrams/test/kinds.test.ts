import { describe, expect, test } from "vitest";
import {
	architecture,
	architectureNodeKinds,
	architectureNodeLooks,
	type Box,
	type Direction,
	render,
	type Scene,
	type SceneNode,
} from "../src/index.ts";

const directions: Direction[] = ["right", "down"];

function sceneOf(diagram: unknown): Scene {
	const { scene } = render(diagram);
	if (scene === undefined) {
		throw new Error("expected a scene");
	}
	return scene;
}

/** One Node of each architecture Kind, with ids named after their Kinds, all with one title. */
function oneOfEach(title: string, direction: Direction = "right") {
	return architecture({ title: "Kinds", direction }, (d) => {
		for (const kind of architectureNodeKinds) {
			d.node({ id: kind, kind, title });
		}
	});
}

function nodeOf(scene: Scene, id: string): SceneNode {
	const node = scene.nodes.find((candidate) => candidate.id === id);
	if (node === undefined) {
		throw new Error(`no Node ${id} in the scene`);
	}
	return node;
}

describe("each architecture Kind", () => {
	test("is the size its Notation sets, whatever its title", () => {
		for (const title of ["Shop", "Warehouse inventory reconciliation service"]) {
			const scene = sceneOf(oneOfEach(title));
			for (const kind of architectureNodeKinds) {
				const { box } = nodeOf(scene, kind);
				const look = architectureNodeLooks[kind];
				expect([box.width, box.height], `${kind}, titled ${title}`).toEqual([
					look.width,
					look.height,
				]);
			}
		}
	});

	test.each(directions)("lands its corners and Ports on the grid, laid out %s", (direction) => {
		const scene = sceneOf(oneOfEach("Shop", direction));
		for (const { id, box, input, output } of scene.nodes) {
			const points = [
				box,
				{ x: box.x + box.width, y: box.y + box.height },
				input.point,
				output.point,
			];
			for (const { x, y } of points) {
				expect([x % scene.grid, y % scene.grid], id).toEqual([0, 0]);
			}
		}
	});
});

/** Whether `inner` lies within `outer`, edges included. */
function within(inner: Box, outer: Box): boolean {
	return (
		inner.x >= outer.x &&
		inner.y >= outer.y &&
		inner.x + inner.width <= outer.x + outer.width &&
		inner.y + inner.height <= outer.y + outer.height
	);
}

describe("a Node's header", () => {
	test.each(directions)(
		"holds the badge at its start, and the title after it, laid out %s",
		(direction) => {
			for (const node of sceneOf(oneOfEach("Shop", direction)).nodes) {
				const { id, box, header, badge, title } = node;
				expect(within(header, box), id).toBe(true);
				expect(header.width, id).toBe(box.width);
				expect(within(badge, header), id).toBe(true);
				expect(badge.x - header.x, id).toBeLessThan(
					header.x + header.width - (badge.x + badge.width),
				);
				expect(title.shortened, id).toBe(false);
				expect(title.point.y, id).toBe(header.y + header.height / 2);
				expect(title.point.x - title.width / 2, id).toBeGreaterThan(badge.x + badge.width);
				expect(title.point.x + title.width / 2, id).toBeLessThan(box.x + box.width);
			}
		},
	);

	test("shortens a title before it would touch the badge or leave the Node", () => {
		const long = "Warehouse inventory reconciliation service";
		for (const node of sceneOf(oneOfEach(long)).nodes) {
			const { id, box, badge, title } = node;
			expect(title.shortened, id).toBe(true);
			expect(title.text, id).toMatch(/\S…$/);
			expect(title.point.x - title.width / 2, id).toBeGreaterThan(badge.x + badge.width);
			expect(title.point.x + title.width / 2, id).toBeLessThan(box.x + box.width);
		}
	});

	test("has the header Ports level with it, laid out right", () => {
		for (const { id, header, input, output } of sceneOf(oneOfEach("Shop")).nodes) {
			const middle = header.y + header.height / 2;
			expect([input.point.y, output.point.y], id).toEqual([middle, middle]);
		}
	});

	test("is the band below a person's head", () => {
		const person = nodeOf(sceneOf(oneOfEach("Shop")), "person");
		expect(person.header.y).toBeGreaterThan(person.box.y);
		expect(person.header.y + person.header.height).toBe(person.box.y + person.box.height);
		const service = nodeOf(sceneOf(oneOfEach("Shop")), "service");
		expect(service.header).toEqual(service.box);
	});
});
