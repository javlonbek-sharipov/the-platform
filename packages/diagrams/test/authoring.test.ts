import { describe, expect, test } from "vitest";
import { type ArchitectureBuilder, architecture, render } from "../src/index.ts";

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

	test("keeps a Diagram's description and a Node's, beside their titles", () => {
		const diagram = architecture(
			{ title: "Shop", description: "How the shop takes orders." },
			(d) => {
				d.node({
					id: "shop-api",
					kind: "service",
					title: "Shop API",
					rows: [{ name: "replicas", value: "3" }],
					description: "Takes orders, and keeps them until they ship.",
					links: [{ id: "shop-db" }],
				});
			},
		);

		expect(JSON.stringify(diagram)).toBe(
			JSON.stringify({
				version: 1,
				notation: "architecture",
				title: "Shop",
				description: "How the shop takes orders.",
				direction: "right",
				members: ["shop-api"],
				nodes: [
					{
						id: "shop-api",
						kind: "service",
						title: "Shop API",
						rows: [{ name: "replicas", value: "3" }],
						description: "Takes orders, and keeps them until they ship.",
						links: [{ id: "shop-db" }],
					},
				],
				groups: [],
				edges: [],
				walkthroughs: [],
			}),
		);
	});

	test("keeps a Node's Rows in order, each a name and an optional value", () => {
		const diagram = architecture({ title: "Shop" }, (d) => {
			d.node({
				id: "shop-db",
				kind: "database",
				title: "Shop database",
				rows: [{ name: "replicas", value: "3" }, { name: "read-only" }],
			});
		});

		expect(diagram.nodes).toEqual([
			{
				id: "shop-db",
				kind: "database",
				title: "Shop database",
				rows: [{ name: "replicas", value: "3" }, { name: "read-only" }],
			},
		]);
	});

	test("ends an Edge at one of a Node's Rows, named through the Node's handle or by ids", () => {
		const diagram = architecture({ title: "Shop" }, (d) => {
			const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
			const events = d.node({
				id: "shop-events",
				kind: "queue",
				title: "Shop events",
				rows: [{ name: "order-placed" }, { name: "order-paid" }],
			});
			const placed = d.edge(api, events.row("order-placed"), { kind: "message" });
			const paid = d.edge({ node: "shop-events", row: "order-paid" }, "shop-api", {
				kind: "message",
			});
			// Default ids name the two Nodes, whatever their Rows.
			expect([placed.id, paid.id]).toEqual(["shop-api->shop-events", "shop-events->shop-api"]);
		});

		expect(diagram.edges).toEqual([
			{
				id: "shop-api->shop-events",
				kind: "message",
				from: "shop-api",
				to: { node: "shop-events", row: "order-placed" },
			},
			{
				id: "shop-events->shop-api",
				kind: "message",
				from: { node: "shop-events", row: "order-paid" },
				to: "shop-api",
			},
		]);
	});

	test("keeps an Edge's label, Technology and rate, after its ends", () => {
		const diagram = architecture({ title: "Shop" }, (d) => {
			const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
			const db = d.node({ id: "shop-db", kind: "database", title: "Shop database" });
			const events = d.node({ id: "shop-events", kind: "queue", title: "Shop events" });
			d.edge(api, db, {
				kind: "call",
				label: "Reads orders",
				technology: "postgres",
				rate: "2k/s",
			});
			d.edge(api, events, { kind: "message", rate: "30/min" });
		});

		expect(diagram.edges.map((edge) => JSON.stringify(edge))).toEqual([
			'{"id":"shop-api->shop-db","kind":"call","from":"shop-api","to":"shop-db","label":"Reads orders","technology":"postgres","rate":"2k/s"}',
			'{"id":"shop-api->shop-events","kind":"message","from":"shop-api","to":"shop-events","rate":"30/min"}',
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

/**
 * Builds a Diagram whose every authoring call is given an option it doesn't
 * know, as a misspelling would. The types reject each one, so each is cast,
 * as an untyped module or a wider type would let it through.
 */
function misspelled() {
	return architecture({ title: "Shop", directon: "down" } as never, (d) => {
		const web = d.node({ id: "web-app", kind: "client", title: "Web app", lable: "x" } as never);
		d.group({ id: "eu-west", kind: "region", title: "EU West", member: [] } as never, (eu) => {
			eu.node({
				id: "shop-api",
				kind: "service",
				title: "Shop API",
				rows: [{ name: "replicas", valeu: "3" }],
			} as never);
		});
		d.edge(web, "shop-api", { kind: "call", lable: "Places orders" } as never);
	});
}

describe("an option that an authoring function doesn't know", () => {
	test("is an error where it would go in the model, naming the options there are, so it never vanishes", () => {
		const shape = (message: string, pointer: string) => ({
			severity: "error",
			rule: "model-shape",
			message,
			pointer,
		});

		expect(render(misspelled())).toEqual({
			diagnostics: [
				shape(
					"The Diagram has no option `directon`. Its options are `id`, `title`, `description` and `direction`.",
					"/directon",
				),
				shape(
					"A Node has no option `lable`. Its options are `id`, `kind`, `title`, `technology`, `external`, `status`, `rows`, `description`, `links` and `callout`.",
					"/nodes/0/lable",
				),
				shape(
					"A Group has no option `member`. Its options are `id`, `kind`, `title`, `description` and `links`.",
					"/groups/0/member",
				),
				shape(
					"A Row has no option `valeu`. Its options are `name` and `value`.",
					"/nodes/1/rows/0/valeu",
				),
				shape(
					"An Edge has no option `lable`. Its options are `kind`, `id`, `label`, `technology` and `rate`.",
					"/edges/0/lable",
				),
			],
		});
	});

	test("stays out of the model itself, which JSON and every comparison see", () => {
		expect(JSON.parse(JSON.stringify(misspelled()))).toEqual({
			version: 1,
			notation: "architecture",
			title: "Shop",
			direction: "right",
			members: ["web-app", "eu-west"],
			nodes: [
				{ id: "web-app", kind: "client", title: "Web app" },
				{ id: "shop-api", kind: "service", title: "Shop API", rows: [{ name: "replicas" }] },
			],
			groups: [{ id: "eu-west", kind: "region", title: "EU West", members: ["shop-api"] }],
			edges: [{ id: "web-app->shop-api", kind: "call", from: "web-app", to: "shop-api" }],
			walkthroughs: [],
		});
	});
});
