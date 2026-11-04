import { describe, expect, test } from "vitest";
import { render } from "../src/index.ts";
import { crowded } from "./fixtures/crowded.ts";
import { labeled } from "./support/labeled.ts";

/**
 * A limit generous enough for any machine that runs the suite, which still
 * catches a blow-up: the crowded fixture renders in a fraction of it. The
 * benchmark, `pnpm bench`, reports the real time.
 */
const generousLimit = 3000;

describe("the crowded fixture", () => {
	const diagram = crowded();

	test("has about 60 Nodes and 150 Edges, in Groups nested three deep", () => {
		expect(diagram.nodes.length).toBeGreaterThanOrEqual(55);
		expect(diagram.nodes.length).toBeLessThanOrEqual(65);
		expect(diagram.edges.length).toBeGreaterThanOrEqual(140);
		expect(diagram.edges.length).toBeLessThanOrEqual(160);
		const parentOf = new Map(
			diagram.groups.flatMap((group) => group.members.map((member) => [member, group.id] as const)),
		);
		const depth = (id: string): number => {
			const parent = parentOf.get(id);
			return parent === undefined ? 0 : 1 + depth(parent);
		};
		expect(Math.max(...diagram.nodes.map(({ id }) => depth(id)))).toBe(3);
	});

	test("fans out from the API gateway to many services in one Group, which layout counts as one block", () => {
		const inside = new Set<string>();
		const gather = (id: string) => {
			inside.add(id);
			for (const member of diagram.groups.find((group) => group.id === id)?.members ?? []) {
				gather(member);
			}
		};
		gather("eu-west");
		const fan = diagram.edges.filter(
			({ from, to }) => from === "api-gateway" && typeof to === "string" && inside.has(to),
		);
		expect(fan.length).toBeGreaterThanOrEqual(14);
	});

	test.each(["right", "down"] as const)(
		"lays out and routes, drawn %s, well within a generous time limit",
		(direction) => {
			const started = performance.now();
			const { scene, diagnostics } = render(crowded(direction));
			const took = performance.now() - started;
			expect(diagnostics).toEqual([]);
			expect(scene?.edges.filter(({ fellBack }) => fellBack)).toEqual([]);
			expect(took).toBeLessThan(generousLimit);
		},
	);

	test.each(["right", "down"] as const)(
		"lays out, routes and labels every Edge, drawn %s, within the same limit",
		(direction) => {
			// Labeled Edges that trunks would crowd out keep lanes of their own, so
			// layout and routing run more than once.
			const started = performance.now();
			const { scene } = render(labeled(crowded(direction)));
			const took = performance.now() - started;
			expect(scene?.edges.filter(({ label }) => label === undefined)).toEqual([]);
			expect(scene?.edges.filter(({ fellBack }) => fellBack)).toEqual([]);
			expect(took).toBeLessThan(generousLimit);
		},
	);
});
