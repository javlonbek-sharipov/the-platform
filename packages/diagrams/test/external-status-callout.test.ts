import { describe, expect, test } from "vitest";
import {
	architecture,
	architectureNotation,
	type Box,
	type Direction,
	nodeKindsOf,
	render,
	type Scene,
	statusesOf,
} from "../src/index.ts";
import { type Drawn, draw, nodeOf, paintsWithin, shapesOf, withoutColor } from "./support/drawn.ts";
import { computedStyle, type Element } from "./support/svg.ts";

/** One Node of each architecture Kind, with ids named after their Kinds. */
function oneOfEach(details: { external?: boolean; callout?: string } = {}) {
	return architecture({ title: "Kinds" }, (d) => {
		for (const kind of nodeKindsOf(architectureNotation)) {
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
		for (const kind of nodeKindsOf(architectureNotation)) {
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
			for (const kind of nodeKindsOf(architectureNotation)) {
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
		for (const status of statusesOf(architectureNotation)) {
			for (const kind of nodeKindsOf(architectureNotation)) {
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
		expect(statusesOf(architectureNotation)).toEqual(["ok", "degraded", "down", "unknown"]);
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
		for (const kind of nodeKindsOf(architectureNotation)) {
			const marks = statusesOf(architectureNotation).map((status) => {
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
				expect(new Set(looks).size, `${kind}: ${part}`).toBe(
					statusesOf(architectureNotation).length,
				);
			}
		}
	});

	test("draws the same mark for a status, whatever the Kind", () => {
		const drawn = draw(everyStatus());
		for (const status of statusesOf(architectureNotation)) {
			const looks = nodeKindsOf(architectureNotation).map((kind) => {
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

const directions: Direction[] = ["right", "down"];

/**
 * The orders API calls its database and its cache, which share a rank, and
 * the cache has a callout. So its tag sits between it and the database, laid
 * out right, and between it and the API, laid out down.
 */
function calledOut(direction: Direction, callout = "single point of failure") {
	return architecture({ title: "Orders", direction }, (d) => {
		const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
		const api = d.node({ id: "orders-api", kind: "service", title: "Orders API" });
		const db = d.node({ id: "orders-db", kind: "database", title: "Orders database" });
		const cache = d.node({ id: "orders-cache", kind: "cache", title: "Orders cache", callout });
		d.edge(web, api, { kind: "call" });
		d.edge(api, db, { kind: "call" });
		d.edge(api, cache, { kind: "call" });
	});
}

/** How far apart two boxes are: the larger of their gaps along x and along y. */
function gap(a: Box, b: Box): number {
	return Math.max(
		b.x - (a.x + a.width),
		a.x - (b.x + b.width),
		b.y - (a.y + a.height),
		a.y - (b.y + b.height),
	);
}

function tagOf(scene: Scene, id: string): Box {
	const tag = nodeOf(scene, id).callout?.tag;
	if (tag === undefined) {
		throw new Error(`Node ${id} has no callout`);
	}
	return tag;
}

describe("a Node's callout", () => {
	test("is a short text in the model", () => {
		const diagram = architecture({ title: "Payments" }, (d) => {
			d.node({
				id: "ledger",
				kind: "database",
				title: "Ledger",
				callout: "single point of failure",
			});
		});

		expect(diagram.nodes).toEqual([
			{ id: "ledger", kind: "database", title: "Ledger", callout: "single point of failure" },
		]);
	});

	test.each([
		["right", "single point of failure"],
		["down", "SPOF"],
	] as const)(
		"puts a tag just above its Node, holding its text, laid out %s",
		(direction, written) => {
			const { scene } = draw(calledOut(direction, written));
			const { box, callout } = nodeOf(scene, "orders-cache");
			expect(callout).toBeDefined();
			if (callout === undefined) {
				return;
			}
			const { tag, text } = callout;
			expect(tag.y + tag.height).toBeLessThanOrEqual(box.y);
			expect(box.y - (tag.y + tag.height)).toBeLessThan(scene.grid);
			expect(tag.x).toBe(box.x);
			expect(tag.x + tag.width).toBeLessThanOrEqual(box.x + box.width);
			expect(text.text).toBe(written);
			expect(text.point.y).toBe(tag.y + tag.height / 2);
			expect(text.point.x - text.width / 2).toBeGreaterThan(tag.x);
			expect(text.point.x + text.width / 2).toBeLessThan(tag.x + tag.width);
		},
	);

	test.each(directions)(
		"gets room from layout, so that no other Node comes near its tag, laid out %s",
		(direction) => {
			const { scene } = draw(calledOut(direction));
			const tag = tagOf(scene, "orders-cache");
			for (const node of scene.nodes.filter(({ id }) => id !== "orders-cache")) {
				expect(gap(tag, node.box), node.id).toBeGreaterThanOrEqual(scene.clearance);
			}
			const { bounds } = scene;
			expect(tag.x).toBeGreaterThanOrEqual(bounds.x);
			expect(tag.y).toBeGreaterThanOrEqual(bounds.y);
		},
	);

	test("keeps its tag beside the input Port, laid out down, where Edges come in from above", () => {
		const { scene, diagnostics } = render(calledOut("down"));
		const cache = scene?.nodes.find((node) => node.id === "orders-cache");
		const tag = cache?.callout?.tag ?? { x: 0, y: 0, width: 0, height: 0 };
		expect(cache?.input.side).toBe("top");
		expect(tag.x + tag.width).toBeLessThan(cache?.input.point.x ?? 0);
		// So a callout as long as this one is shortened there, though it fits laid out right.
		expect(cache?.callout?.text.shortened).toBe(true);
		expect(diagnostics.map((diagnostic) => diagnostic.rule)).toEqual(["text-shortened"]);
		expect(render(calledOut("right")).diagnostics).toEqual([]);
	});

	test.each(directions)("keeps every route clear of its tag, laid out %s", (direction) => {
		// The API's call to search passes the cache's rank, through the corridor
		// above the cache, where its tag is.
		const diagram = architecture({ title: "Orders", direction }, (d) => {
			const api = d.node({ id: "orders-api", kind: "service", title: "Orders API" });
			const db = d.node({ id: "orders-db", kind: "database", title: "Orders database" });
			const cache = d.node({
				id: "orders-cache",
				kind: "cache",
				title: "Orders cache",
				callout: "single point of failure",
			});
			const search = d.node({ id: "orders-search", kind: "search", title: "Search" });
			d.edge(api, db, { kind: "call" });
			d.edge(api, cache, { kind: "call" });
			d.edge(api, search, { kind: "call" });
			d.edge(db, search, { kind: "call" });
		});
		for (const fixture of [diagram, calledOut(direction)]) {
			const { scene } = draw(fixture);
			const tags = scene.nodes.flatMap((node) =>
				node.callout === undefined ? [] : [node.callout.tag],
			);
			expect(tags.length).toBeGreaterThan(0);
			for (const edge of scene.edges) {
				expect(edge.fellBack, edge.id).toBe(false);
				edge.route.slice(1).forEach((point, index) => {
					const from = edge.route[index] ?? point;
					const run = {
						x: Math.min(from.x, point.x),
						y: Math.min(from.y, point.y),
						width: Math.abs(point.x - from.x),
						height: Math.abs(point.y - from.y),
					};
					for (const tag of tags) {
						expect(gap(run, tag), `${edge.id}, run ${index}`).toBeGreaterThan(0);
					}
				});
			}
		}
	});

	test("shortens a callout too wide for its tag, and warns, naming the Node", () => {
		const long = "this cache is the only copy of every order placed today";
		const { scene, diagnostics } = render(calledOut("right", long));
		const text = scene?.nodes.find((node) => node.id === "orders-cache")?.callout?.text;
		expect(text?.shortened).toBe(true);
		expect(text?.text).toMatch(/^this cache .*\S…$/);
		expect(diagnostics).toEqual([
			{
				severity: "warning",
				rule: "text-shortened",
				message: `Node \`orders-cache\`'s callout is too wide for its tag, so it's shortened to \`${text?.text}\`. Choose a shorter callout to show it in full.`,
				pointer: "/nodes/3/callout",
			},
		]);
	});

	test("warns about characters the bundled font lacks", () => {
		const { diagnostics } = render(calledOut("right", "東京 only"));
		expect(diagnostics).toEqual([
			{
				severity: "warning",
				rule: "glyph-missing",
				message:
					"Node `orders-cache`'s callout has characters that the bundled font lacks: 東 (U+6771) and 京 (U+4EAC). They're measured at an average width, and drawn in a fallback font.",
				pointer: "/nodes/3/callout",
			},
		]);
	});

	test("highlights every Kind's outline in one color of its own, more strongly than its hue", () => {
		const drawn = draw(oneOfEach({ callout: "SPOF" }));
		const plain = draw(oneOfEach());
		for (const theme of ["light", "dark"] as const) {
			const highlights = new Set<string>();
			for (const kind of nodeKindsOf(architectureNotation)) {
				const stroke = (from: Drawn) => {
					const [outline] = strokedParts(from, kind).outline.filter(
						(shape) => computedStyle(shape, from.rules, theme).get("fill") !== "none",
					);
					const style =
						outline === undefined ? undefined : computedStyle(outline, from.rules, theme);
					return { color: style?.get("stroke") ?? "", width: Number(style?.get("stroke-width")) };
				};
				const highlighted = stroke(drawn);
				const usual = stroke(plain);
				expect(highlighted.color, `${kind}, ${theme}`).not.toBe(usual.color);
				expect(highlighted.width, kind).toBeGreaterThan(usual.width);
				highlights.add(highlighted.color);
			}
			expect([...highlights], theme).toHaveLength(1);
		}
	});

	test("draws the tag above the Node, and the rest of the Node inside its rectangle", () => {
		const drawn = draw(oneOfEach({ callout: "single point of failure" }));
		for (const node of drawn.scene.nodes) {
			const tag = tagOf(drawn.scene, node.id);
			const shapes = shapesOf(drawn, node.id);
			const inTag = shapes.filter((shape) => paintsWithin(drawn, shape, tag));
			expect(inTag.length, node.id).toBeGreaterThan(0);
			for (const shape of shapes.filter((each) => !inTag.includes(each))) {
				expect(paintsWithin(drawn, shape, node.box), `${node.id}: <${shape.name}>`).toBe(true);
			}
		}
	});

	test("isn't drawn for a Node without one", () => {
		const { scene } = draw(oneOfEach());
		for (const node of scene.nodes) {
			expect(node.callout, node.id).toBeUndefined();
		}
	});
});
