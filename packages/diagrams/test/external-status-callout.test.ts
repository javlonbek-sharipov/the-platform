import { describe, expect, test } from "vitest";
import { architecture, architectureNodeKinds } from "../src/index.ts";
import { type Drawn, draw, nodeOf, paintsWithin, shapesOf } from "./support/drawn.ts";
import { computedStyle, type Element } from "./support/svg.ts";

/** One Node of each architecture Kind, with ids named after their Kinds. */
function oneOfEach(details: { external?: boolean } = {}) {
	return architecture({ title: "Kinds" }, (d) => {
		for (const kind of architectureNodeKinds) {
			d.node({ id: kind, kind, title: "Shop", ...details });
		}
	});
}

/** A Node's stroked shapes, split into those of its badge and the rest. */
function strokedParts(drawn: Drawn, id: string): { badge: Element[]; outline: Element[] } {
	const { badge } = nodeOf(drawn.scene, id);
	const stroked = shapesOf(drawn, id).filter(
		(shape) => computedStyle(shape, drawn.rules, "light").get("stroke") !== "none",
	);
	const inBadge = stroked.filter((shape) => paintsWithin(drawn, shape, badge));
	return { badge: inBadge, outline: stroked.filter((shape) => !inBadge.includes(shape)) };
}

function dashed(drawn: Drawn, shape: Element): boolean {
	return computedStyle(shape, drawn.rules, "light").get("stroke-dasharray") !== "none";
}

describe("an External Node", () => {
	test("is marked External in the model", () => {
		const diagram = architecture({ title: "Payments" }, (d) => {
			d.node({ id: "card-network", kind: "system", title: "Card network", external: true });
			d.node({ id: "payments-api", kind: "service", title: "Payments API" });
		});

		expect(diagram.nodes).toEqual([
			{ id: "card-network", kind: "system", title: "Card network", external: true },
			{ id: "payments-api", kind: "service", title: "Payments API" },
		]);
	});

	test("draws its outline dashed and its badge solid, for every Kind", () => {
		const drawn = draw(oneOfEach({ external: true }));
		for (const kind of architectureNodeKinds) {
			expect(nodeOf(drawn.scene, kind).external, kind).toBe(true);
			const { badge, outline } = strokedParts(drawn, kind);
			expect(outline.length, kind).toBeGreaterThan(0);
			expect(
				outline.every((shape) => dashed(drawn, shape)),
				`${kind}'s outline is dashed`,
			).toBe(true);
			expect(
				badge.some((shape) => dashed(drawn, shape)),
				`${kind}'s badge is dashed`,
			).toBe(false);
		}
	});

	test("isn't what a Node is unless it's marked so", () => {
		for (const drawn of [draw(oneOfEach()), draw(oneOfEach({ external: false }))]) {
			for (const kind of architectureNodeKinds) {
				expect(nodeOf(drawn.scene, kind).external, kind).toBe(false);
				const dashes = shapesOf(drawn, kind).filter((shape) => dashed(drawn, shape));
				expect(dashes, kind).toEqual([]);
			}
		}
	});
});
