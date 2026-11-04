import { describe, expect, test } from "vitest";
import {
	architecture,
	architectureNodeKinds,
	architectureNodeLooks,
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
