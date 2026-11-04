import { describe, expect, test } from "vitest";
import { architecture, type Diagram, render } from "../src/index.ts";
import { deepNesting } from "./fixtures/groups.ts";
import { everyFixture } from "./support/fixtures.ts";
import { ancestors, descendants, type Element, matches, parseSvg, rulesOf } from "./support/svg.ts";

const fixtures = await everyFixture();

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

	test("is byte-identical after a model with nested Groups makes a round trip through JSON", () => {
		for (const direction of ["right", "down"] as const) {
			const diagram = deepNesting(direction);
			expect(svgOf(JSON.parse(JSON.stringify(diagram)))).toBe(svgOf(diagram));
		}
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

	test("draws each Group in its own group, beneath the Edges and Nodes, with its id, Kind, box and title", () => {
		const regions = architecture({ title: "Regions" }, (d) => {
			const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
			d.group({ id: "eu-west", kind: "region", title: "EU West" }, (eu) => {
				const api = eu.node({ id: "shop-api", kind: "service", title: "Shop API" });
				eu.group({ id: "eu-west-a", kind: "zone", title: "Zone A" }, (zone) => {
					zone.group({ id: "billing", kind: "system", title: "Billing" }, (billing) => {
						const ledger = billing.node({ id: "ledger", kind: "worker", title: "Ledger" });
						d.edge(api, ledger, { kind: "message" });
					});
				});
				d.edge(web, api, { kind: "call" });
			});
		});
		const { scene, svg = "" } = render(regions);
		const drawn = [
			...svg.matchAll(
				/<g data-group="([^"]*)" data-kind="([^"]*)">\s*<rect class="diagram-group" x="([^"]*)" y="([^"]*)" width="([^"]*)" height="([^"]*)"([^>]*)\/>\s*<text [^>]*>([^<]*)<\/text>/g,
			),
		];

		expect(
			drawn.map(([, id, kind, x, y, width, height, , title]) => ({
				id,
				kind,
				x,
				y,
				width,
				height,
				title,
			})),
		).toEqual(
			(scene?.groups ?? []).map(({ id, kind, box, title }) => ({
				id,
				kind,
				x: String(box.x),
				y: String(box.y),
				width: String(box.width),
				height: String(box.height),
				title: title.text,
			})),
		);
		expect(drawn.map(([, id]) => id)).toEqual(["eu-west", "eu-west-a", "billing"]);
		expect(svg.lastIndexOf("data-group=")).toBeLessThan(svg.indexOf("data-edge="));
		// Each Kind draws its box its own way.
		expect(new Set(drawn.map(([, , , , , , , style]) => style)).size).toBe(3);
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

describe("every text in every fixture", () => {
	test("sets its own baseline, or inherits none, since SVG 1.1 doesn't inherit one from a group", () => {
		expect(fixtures.length).toBeGreaterThan(10);
		for (const [name, diagram] of fixtures) {
			const { svg } = render(diagram);
			const root = parseSvg(svg ?? "");
			const rules = rulesOf(root);
			/** Whether the element sets `dominant-baseline`, by an attribute or by a rule that picks it. */
			const sets = (element: Element) =>
				element.attributes.has("dominant-baseline") ||
				rules.some(
					(rule) =>
						rule.declarations.some(([property]) => property === "dominant-baseline") &&
						rule.selectors.some((selector) => matches(element, selector)),
				);
			const texts = descendants(root).filter((element) => element.name === "text");
			expect(texts.length, name).toBeGreaterThan(0);
			for (const text of texts) {
				expect(sets(text) || !ancestors(text).some(sets), `${name}: ${text.text}`).toBe(true);
			}
		}
	});
});
