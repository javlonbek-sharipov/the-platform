import { describe, expect, test } from "vitest";
import { type ArchitectureBuilder, architecture } from "../src/index.ts";

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

	test("lays a Diagram out to the right unless its author chooses down", () => {
		const build = (d: ArchitectureBuilder) => {
			d.node({ id: "shop-api", kind: "service", title: "Shop API" });
		};

		expect(architecture({ title: "Shop" }, build).direction).toBe("right");
		expect(architecture({ title: "Shop", direction: "right" }, build).direction).toBe("right");
		expect(architecture({ title: "Shop", direction: "down" }, build).direction).toBe("down");
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

	test("keeps a Node's Links: to an id, or to a document and one of its sections", () => {
		const diagram = architecture({ title: "Shop" }, (d) => {
			d.node({
				id: "shop-api",
				kind: "service",
				title: "Shop API",
				links: [
					{ id: "payments-api" },
					{ doc: "docs/adr/0002-payments.md", label: "Why we pay later" },
					{ doc: "docs/shop.md", section: "Checkout" },
				],
			});
		});

		expect(diagram.nodes).toEqual([
			{
				id: "shop-api",
				kind: "service",
				title: "Shop API",
				links: [
					{ id: "payments-api" },
					{ doc: "docs/adr/0002-payments.md", label: "Why we pay later" },
					{ doc: "docs/shop.md", section: "Checkout" },
				],
			},
		]);
	});

	test("declares a Group's members inside its callback, so each Node gets exactly one parent", () => {
		const diagram = architecture({ title: "Shop" }, (d) => {
			const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
			const region = d.group({ id: "eu-west", kind: "region", title: "EU West" }, (eu) => {
				const api = eu.node({ id: "shop-api", kind: "service", title: "Shop API" });
				eu.group({ id: "eu-west-a", kind: "zone", title: "Zone A" }, (zone) => {
					const db = zone.node({ id: "shop-db", kind: "database", title: "Shop database" });
					zone.edge(api, db, { kind: "call" });
				});
				d.edge(web, api, { kind: "call" });
			});
			expect(region.id).toBe("eu-west");
		});

		expect(diagram).toEqual({
			version: 1,
			notation: "architecture",
			title: "Shop",
			direction: "right",
			members: ["web-app", "eu-west"],
			nodes: [
				{ id: "web-app", kind: "client", title: "Web app" },
				{ id: "shop-api", kind: "service", title: "Shop API" },
				{ id: "shop-db", kind: "database", title: "Shop database" },
			],
			groups: [
				{ id: "eu-west", kind: "region", title: "EU West", members: ["shop-api", "eu-west-a"] },
				{ id: "eu-west-a", kind: "zone", title: "Zone A", members: ["shop-db"] },
			],
			edges: [
				{ id: "shop-api->shop-db", kind: "call", from: "shop-api", to: "shop-db" },
				{ id: "web-app->shop-api", kind: "call", from: "web-app", to: "shop-api" },
			],
			walkthroughs: [],
		});
	});

	test("keeps declaration order in every members list, even when a builder declares after an inner Group's", () => {
		const diagram = architecture({ title: "Shop" }, (d) => {
			d.group({ id: "shop", kind: "system", title: "Shop" }, (shop) => {
				shop.node({ id: "shop-api", kind: "service", title: "Shop API" });
				shop.group({ id: "storage", kind: "zone", title: "Storage" }, (storage) => {
					storage.node({ id: "shop-db", kind: "database", title: "Shop database" });
					shop.node({ id: "shop-cache", kind: "cache", title: "Shop cache" });
					d.node({ id: "web-app", kind: "client", title: "Web app" });
					storage.node({ id: "image-store", kind: "storage", title: "Image store" });
				});
				shop.node({ id: "mailer", kind: "worker", title: "Mailer" });
			});
			d.node({ id: "admin-app", kind: "client", title: "Admin app" });
		});

		expect(diagram.members).toEqual(["shop", "web-app", "admin-app"]);
		expect(diagram.groups.map(({ id, members }) => [id, members])).toEqual([
			["shop", ["shop-api", "storage", "shop-cache", "mailer"]],
			["storage", ["shop-db", "image-store"]],
		]);
	});

	test("keeps a Group's description and Links", () => {
		const diagram = architecture({ title: "Shop" }, (d) => {
			d.group(
				{
					id: "shop",
					kind: "system",
					title: "Shop",
					description: "Everything that sells to shoppers.",
					links: [{ id: "payments" }, { doc: "docs/shop.md", section: "Checkout" }],
				},
				(shop) => {
					shop.node({ id: "shop-api", kind: "service", title: "Shop API" });
				},
			);
		});

		expect(diagram.groups).toEqual([
			{
				id: "shop",
				kind: "system",
				title: "Shop",
				members: ["shop-api"],
				description: "Everything that sells to shoppers.",
				links: [{ id: "payments" }, { doc: "docs/shop.md", section: "Checkout" }],
			},
		]);
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
