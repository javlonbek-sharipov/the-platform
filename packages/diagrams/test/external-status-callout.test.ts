import { describe, expect, test } from "vitest";
import { architecture, architectureNodeKinds, architectureStatuses } from "../src/index.ts";
import { type Drawn, draw, nodeOf, paintsWithin, shapesOf, withoutColor } from "./support/drawn.ts";
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

/** One Node of each Kind for each status, with ids like `database-down`. */
function everyStatus(title = "Shop") {
	return architecture({ title: "Statuses" }, (d) => {
		for (const status of architectureStatuses) {
			for (const kind of architectureNodeKinds) {
				d.node({ id: `${kind}-${status}`, kind, title, status });
			}
		}
	});
}

/** The shapes that draw a Node's status mark: those that paint within the mark's box. */
function markOf(drawn: Drawn, id: string): Element[] {
	const mark = nodeOf(drawn.scene, id).status?.mark;
	if (mark === undefined) {
		throw new Error(`Node ${id} has no status mark`);
	}
	return shapesOf(drawn, id).filter((shape) => paintsWithin(drawn, shape, mark));
}

/** The colors a mark paints in, in a theme. */
function markColors(drawn: Drawn, shapes: Element[], theme: "light" | "dark"): string {
	return shapes
		.map((shape) => {
			const style = computedStyle(shape, drawn.rules, theme);
			return [style.get("fill"), style.get("stroke")].filter((paint) => paint !== "none").join(" ");
		})
		.join(" ");
}

describe("a Node's status", () => {
	test("is one of ok, degraded, down and unknown, in the model", () => {
		expect(architectureStatuses).toEqual(["ok", "degraded", "down", "unknown"]);
		const diagram = architecture({ title: "Payments" }, (d) => {
			d.node({ id: "payments-api", kind: "service", title: "Payments API", status: "degraded" });
			d.node({ id: "ledger", kind: "database", title: "Ledger" });
		});

		expect(diagram.nodes).toEqual([
			{ id: "payments-api", kind: "service", title: "Payments API", status: "degraded" },
			{ id: "ledger", kind: "database", title: "Ledger" },
		]);
	});

	test("shows as a mark at the end of the header, clear of the title", () => {
		for (const title of ["Shop", "Warehouse inventory reconciliation service"]) {
			const { scene } = draw(everyStatus(title));
			for (const node of scene.nodes) {
				const { id, header, badge, title: drawn, status } = node;
				const mark = status?.mark;
				expect(mark, id).toBeDefined();
				if (mark === undefined) {
					continue;
				}
				expect(status?.value, id).toBe(id.slice(id.indexOf("-") + 1));
				expect(mark.x, id).toBeGreaterThan(badge.x + badge.width);
				expect(mark.x + mark.width, id).toBeLessThanOrEqual(header.x + header.width);
				expect(mark.y + mark.height / 2, id).toBe(header.y + header.height / 2);
				expect(drawn.point.x - drawn.width / 2, id).toBeGreaterThan(badge.x + badge.width);
				expect(drawn.point.x + drawn.width / 2, id).toBeLessThan(mark.x);
				expect(drawn.shortened, id).toBe(title !== "Shop");
			}
		}
	});

	test("draws a mark that differs from every other status's in both shape and color", () => {
		const drawn = draw(everyStatus());
		for (const kind of architectureNodeKinds) {
			const marks = architectureStatuses.map((status) => {
				const id = `${kind}-${status}`;
				const shapes = markOf(drawn, id);
				const mark = nodeOf(drawn.scene, id).status?.mark ?? { x: 0, y: 0 };
				return {
					status,
					shape: shapes.map((shape) => withoutColor(drawn, shape, mark)).join("\n"),
					light: markColors(drawn, shapes, "light"),
					dark: markColors(drawn, shapes, "dark"),
				};
			});
			for (const part of ["shape", "light", "dark"] as const) {
				const looks = marks.map((mark) => mark[part]);
				expect(
					looks.every((look) => look !== ""),
					`${kind}: ${part}`,
				).toBe(true);
				expect(new Set(looks).size, `${kind}: ${part}`).toBe(architectureStatuses.length);
			}
		}
	});

	test("draws the same mark for a status, whatever the Kind", () => {
		const drawn = draw(everyStatus());
		for (const status of architectureStatuses) {
			const looks = architectureNodeKinds.map((kind) => {
				const id = `${kind}-${status}`;
				const mark = nodeOf(drawn.scene, id).status?.mark ?? { x: 0, y: 0 };
				const shapes = markOf(drawn, id);
				return `${shapes.map((shape) => withoutColor(drawn, shape, mark)).join("\n")} ${markColors(drawn, shapes, "light")}`;
			});
			expect(new Set(looks).size, status).toBe(1);
		}
	});

	test("isn't drawn for a Node without one", () => {
		const { scene } = draw(oneOfEach());
		for (const node of scene.nodes) {
			expect(node.status, node.id).toBeUndefined();
		}
	});
});
