import { describe, expect, test } from "vitest";
import { architecture } from "../src/index.ts";

describe("the architecture builder", () => {
	test("produces a version-1 JSON model", () => {
		const diagram = architecture({ title: "Shop" }, (d) => {
			const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
			const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
			d.edge(web, api, { kind: "call" });
		});

		expect(diagram).toEqual({
			version: 1,
			notation: "architecture",
			title: "Shop",
			direction: "right",
			members: ["web-app", "shop-api"],
			nodes: [
				{ id: "web-app", kind: "client", title: "Web app" },
				{ id: "shop-api", kind: "service", title: "Shop API" },
			],
			groups: [],
			edges: [{ id: "web-app->shop-api", kind: "call", from: "web-app", to: "shop-api" }],
			walkthroughs: [],
		});
	});

	test("keeps an Edge's explicit id", () => {
		const diagram = architecture({ title: "Shop" }, (d) => {
			const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
			const events = d.node({ id: "shop-events", kind: "queue", title: "Shop events" });
			d.edge(api, events, { kind: "call", id: "publish" });
			d.edge(api, events, { kind: "message" });
		});

		expect(diagram.edges.map((edge) => edge.id)).toEqual(["publish", "shop-api->shop-events"]);
	});

	test("accepts a Node's id in place of its handle", () => {
		const diagram = architecture({ title: "Shop" }, (d) => {
			const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
			d.node({ id: "shop-db", kind: "database", title: "Shop database" });
			const edge = d.edge(api, "shop-db", { kind: "call" });
			expect(edge.id).toBe("shop-api->shop-db");
		});

		expect(diagram.edges).toEqual([
			{ id: "shop-api->shop-db", kind: "call", from: "shop-api", to: "shop-db" },
		]);
	});
});
