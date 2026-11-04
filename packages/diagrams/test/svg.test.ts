import { describe, expect, test } from "vitest";
import { architecture, type Diagram, render } from "../src/index.ts";

const shop = architecture({ title: "Shop" }, (d) => {
	const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
	const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
	const db = d.node({ id: "shop-db", kind: "database", title: "Shop database" });
	const events = d.node({ id: "shop-events", kind: "queue", title: "Shop events" });
	d.edge(web, api, { kind: "call" });
	d.edge(api, db, { kind: "call" });
	d.edge(api, events, { kind: "message" });
});

function svgOf(diagram: unknown): string {
	const { svg, diagnostics } = render(diagram);
	expect(diagnostics).toEqual([]);
	if (svg === undefined) {
		throw new Error("expected an SVG");
	}
	return svg;
}

describe("the SVG", () => {
	test("is byte-identical when the same model is rendered twice", () => {
		expect(svgOf(shop)).toBe(svgOf(shop));
	});

	test("is byte-identical after the model makes a round trip through JSON", () => {
		const roundTripped: unknown = JSON.parse(JSON.stringify(shop));
		expect(svgOf(roundTripped)).toBe(svgOf(shop));
	});

	test("is byte-identical for an equal model built another way", () => {
		const byIds: Diagram = architecture({ title: "Shop" }, (d) => {
			d.node({ id: "web-app", kind: "client", title: "Web app" });
			d.node({ id: "shop-api", kind: "service", title: "Shop API" });
			d.node({ id: "shop-db", kind: "database", title: "Shop database" });
			d.node({ id: "shop-events", kind: "queue", title: "Shop events" });
			d.edge("web-app", "shop-api", { kind: "call" });
			d.edge("shop-api", "shop-db", { kind: "call" });
			d.edge("shop-api", "shop-events", { kind: "message", id: "shop-api->shop-events" });
		});
		expect(byIds).toEqual(shop);
		expect(svgOf(byIds)).toBe(svgOf(shop));
	});

	test("ends every line with LF, including the last", () => {
		const svg = svgOf(shop);
		expect(svg).not.toContain("\r");
		expect(svg.endsWith("</svg>\n")).toBe(true);
	});

	test("writes numbers with at most two decimals, and never a negative zero", () => {
		const numbers = svgOf(shop).match(/-?\d+(\.\d+)?/g) ?? [];
		expect(numbers.length).toBeGreaterThan(0);
		for (const number of numbers) {
			expect(number).toMatch(/^-?\d+(\.\d{1,2})?$/);
			expect(number).not.toMatch(/^-0(\.0+)?$/);
		}
	});

	test("draws each Node and Edge in its own group, in model order, with its id and Kind", () => {
		const svg = svgOf(shop);
		const nodes = [...svg.matchAll(/<g data-node="([^"]*)" data-kind="([^"]*)">/g)];
		expect(nodes.map(([, id, kind]) => [id, kind])).toEqual([
			["web-app", "client"],
			["shop-api", "service"],
			["shop-db", "database"],
			["shop-events", "queue"],
		]);
		const edges = [
			...svg.matchAll(
				/<g data-edge="([^"]*)" data-kind="([^"]*)" data-from="([^"]*)" data-to="([^"]*)">/g,
			),
		];
		expect(edges.map(([, id, kind, from, to]) => [id, kind, from, to])).toEqual([
			["web-app-&gt;shop-api", "call", "web-app", "shop-api"],
			["shop-api-&gt;shop-db", "call", "shop-api", "shop-db"],
			["shop-api-&gt;shop-events", "message", "shop-api", "shop-events"],
		]);
	});

	test("draws each rounded corner of a route with an arc command of the corner's radius", () => {
		const { scene, svg } = render(shop);
		const paths = new Map(
			[...(svg ?? "").matchAll(/<g data-edge="([^"]*)"[^>]*>\s*<path d="([^"]*)"\/>/g)].map(
				([, id, d]) => [id?.replaceAll("&gt;", ">"), d ?? ""],
			),
		);
		const corners = scene?.edges.flatMap((edge) => edge.route.slice(1, -1)) ?? [];
		expect(corners.length).toBeGreaterThan(0);
		for (const edge of scene?.edges ?? []) {
			const arcs = [...(paths.get(edge.id) ?? "").matchAll(/A ([\d.]+) ([\d.]+) 0 0 [01] /g)];
			expect(arcs.map(([, rx, ry]) => [Number(rx), Number(ry)])).toEqual(
				edge.route.slice(1, -1).map(({ radius }) => [radius, radius]),
			);
		}
	});

	test("escapes text", () => {
		const svg = svgOf(
			architecture({ title: "Escapes" }, (d) => {
				d.node({ id: "billing", kind: "system", title: 'R&D "Ops" <beta>' });
			}),
		);
		expect(svg).toContain('>R&amp;D "Ops" &lt;beta&gt;</text>');
	});
});
