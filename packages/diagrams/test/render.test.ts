import { describe, expect, test } from "vitest";
import { architecture, render } from "../src/index.ts";

const shop = architecture({ title: "Shop" }, (d) => {
	const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
	const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
	const db = d.node({ id: "shop-db", kind: "database", title: "Shop database" });
	d.edge(web, api, { kind: "call" });
	d.edge(api, db, { kind: "call" });
});

describe("the core", () => {
	test("returns a scene and an SVG, and no diagnostics, for a valid Diagram", () => {
		const result = render(shop);

		expect(result.diagnostics).toEqual([]);
		expect(result.scene?.nodes.map((node) => node.id)).toEqual(["web-app", "shop-api", "shop-db"]);
		expect(result.scene?.edges.map((edge) => edge.id)).toEqual([
			"web-app->shop-api",
			"shop-api->shop-db",
		]);
		expect(result.svg).toMatch(/^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
	});
});
