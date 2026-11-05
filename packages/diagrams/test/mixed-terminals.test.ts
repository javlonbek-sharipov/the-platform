import { expect, test } from "vitest";
import { builderOf, type Direction } from "../src/index.ts";
import { contextMap } from "./fixtures/context-map.ts";
import { distanceToShapes, draw, edgeGroupOf, linesOf } from "./support/drawn.ts";
import { plumbingNotation } from "./support/plumbing.ts";
import { descendants, fillContains, isShape, runsOf } from "./support/svg.ts";

for (const direction of ["right", "down"] as const) {
	for (const reverse of [false, true]) {
		test(`a symmetric route never inherits another Edge's arrowhead (${direction}, reversed ${reverse})`, () => {
			const model = contextMap(direction);
			if (reverse) {
				model.members.reverse();
				model.nodes.reverse();
				model.edges.reverse();
			}
			assertSeparateMarkers(model);
		});
	}
}

test("mixed terminal markers follow a caller's Notation capabilities, including Row Ports", () => {
	for (const direction of ["right", "down"] as const satisfies Direction[]) {
		const model = builderOf(plumbingNotation)({ title: "Coupled tanks", direction }, (d) => {
			const source = d.node({ id: "source", kind: "tank", title: "Source" });
			const partner = d.node({ id: "partner", kind: "tank", title: "Partner" });
			const target = d.node({
				id: "target",
				kind: "tank",
				title: "Target",
				rows: [{ name: "Water" }],
			});
			d.edge(source, target.row("Water"), { kind: "drain" });
			d.edge(partner, target.row("Water"), { kind: "coupling" });
		});
		assertSeparateMarkers(model, plumbingNotation);
	}
});

function assertSeparateMarkers(
	model: unknown,
	notation = undefined as typeof plumbingNotation | undefined,
) {
	const drawn = draw(model, notation === undefined ? undefined : { notations: [notation] });
	expect(drawn.scene.diagnostics).toEqual([]);
	const symmetric = new Set(
		notation === undefined ? ["partnership", "shared-kernel"] : ["coupling"],
	);
	const routes = drawn.scene.edges.filter((edge) => symmetric.has(edge.kind));
	let comparisons = 0;
	for (const edge of drawn.scene.edges.filter((edge) => !symmetric.has(edge.kind))) {
		const markers = descendants(edgeGroupOf(drawn, edge.id)).filter(
			(shape) => isShape(shape) && shape.attributes.get("fill") === "currentColor",
		);
		expect(markers, edge.id).toHaveLength(1);
		for (const other of routes.filter((other) => other.to === edge.to)) {
			comparisons += 1;
			// Inspect the complete drawing: a marker in a different Edge's group
			// still gives this symmetric stroke an apparent direction if it touches it.
			for (const line of linesOf(drawn, other)) {
				for (const run of runsOf(line)) {
					for (let i = 1; i < run.length; i += 1) {
						const a = run[i - 1];
						const b = run[i];
						if (a === undefined || b === undefined) continue;
						const length = Math.hypot(b.x - a.x, b.y - a.y);
						for (let at = 0; at <= length; at += 0.5) {
							const point = {
								x: a.x + ((b.x - a.x) * at) / length,
								y: a.y + ((b.y - a.y) * at) / length,
							};
							for (const marker of markers) {
								expect(fillContains(marker, point), `${edge.id} marker on ${other.id}`).toBe(false);
								expect(
									distanceToShapes(point, runsOf(marker)),
									`${edge.id} marker beside ${other.id}`,
								).toBeGreaterThan(2.25);
							}
						}
					}
				}
			}
		}
	}
	expect(comparisons).toBeGreaterThan(0);
}
