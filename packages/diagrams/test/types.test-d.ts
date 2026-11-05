import { expectTypeOf, test } from "vitest";
import {
	type ArchitectureBuilder,
	type ArchitectureEdgeKind,
	type ArchitectureGroupKind,
	type ArchitectureNode,
	type ArchitectureNodeKind,
	architecture,
	atlas,
	type EdgeOptions,
	type GroupHandle,
	type KnownTechnology,
	type NodeHandle,
	type RowEnd,
	type SceneLabel,
	type SceneLogo,
	type SceneNode,
	type Technology,
} from "../src/index.ts";

test("the architecture Notation has 12 Node Kinds and two Edge Kinds", () => {
	expectTypeOf<ArchitectureNodeKind>().toEqualTypeOf<
		| "person"
		| "system"
		| "client"
		| "gateway"
		| "service"
		| "worker"
		| "function"
		| "database"
		| "cache"
		| "queue"
		| "storage"
		| "search"
	>();
	expectTypeOf<ArchitectureEdgeKind>().toEqualTypeOf<"call" | "message">();
});

test("a Node Kind that the Notation doesn't have is a type error", () => {
	architecture({ title: "Shop" }, (d) => {
		// @ts-expect-error: `servce` isn't an architecture Kind.
		d.node({ id: "shop-api", kind: "servce", title: "Shop API" });
	});
});

test("an Edge Kind that the Notation doesn't have is a type error", () => {
	architecture({ title: "Shop" }, (d) => {
		const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
		const db = d.node({ id: "shop-db", kind: "database", title: "Shop database" });
		// @ts-expect-error: `rest` isn't an architecture Edge Kind.
		d.edge(api, db, { kind: "rest" });
	});
});

test("declaring a Node returns a handle that an Edge accepts", () => {
	architecture({ title: "Shop" }, (d) => {
		const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
		expectTypeOf(api).toEqualTypeOf<NodeHandle>();
		expectTypeOf(d.edge).parameter(0).toExtend<NodeHandle | RowEnd | string>();
		// @ts-expect-error: an Edge end is a handle or an id, not a number.
		d.edge(api, 7, { kind: "call" });
	});
});

test("a Node handle carries its Rows' names, so naming a Row the Node doesn't have is a type error", () => {
	architecture({ title: "Shop" }, (d) => {
		const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
		const db = d.node({
			id: "shop-db",
			kind: "database",
			title: "Shop database",
			rows: [{ name: "orders", value: "table" }, { name: "stock" }],
		});
		expectTypeOf(db).toEqualTypeOf<NodeHandle<"orders" | "stock">>();
		d.edge(api, db.row("orders"), { kind: "call" });
		d.edge(db.row("stock"), api, { kind: "message" });
		// @ts-expect-error: `shop-db` has no Row `order`.
		d.edge(api, db.row("order"), { kind: "call" });
		// @ts-expect-error: `shop-api` has no Rows at all.
		d.edge(api.row("orders"), db, { kind: "call" });
	});
});

test("a Node defined once, as a constant, carries its Rows' names to every Diagram", () => {
	const ordersDb = {
		id: "orders-db",
		kind: "database",
		title: "Orders database",
		rows: [{ name: "orders", value: "table" }],
	} as const satisfies ArchitectureNode;

	architecture({ title: "Orders" }, (d) => {
		const db = d.node(ordersDb);
		expectTypeOf(db).toEqualTypeOf<NodeHandle<"orders">>();
		// @ts-expect-error: `orders-db` has no Row `stock`.
		db.row("stock");
	});
});

test("a Link points at exactly one thing: an id, a document or a term", () => {
	architecture({ title: "Shop" }, (d) => {
		d.node({
			id: "billing-api",
			kind: "service",
			title: "Billing API",
			links: [{ term: "Invoice", context: "billing" }, { term: "Order" }],
		});
		d.node({
			id: "billing",
			kind: "system",
			title: "Billing",
			// @ts-expect-error: a term Link cannot also name an id.
			links: [{ term: "Invoice", id: "invoice" }],
		});
		d.node({
			id: "orders",
			kind: "system",
			title: "Orders",
			// @ts-expect-error: only a term Link can name another context.
			links: [{ doc: "orders.md", context: "ordering" }],
		});
		d.node({
			id: "shop-api",
			kind: "service",
			title: "Shop API",
			links: [
				{ id: "payments-api", label: "Payments" },
				{ doc: "docs/shop.md", section: "Checkout", label: "Checkout" },
			],
		});
		// @ts-expect-error: a Link has an id or a document, not both.
		d.node({ id: "web-app", kind: "client", title: "Web app", links: [{ id: "a", doc: "b.md" }] });
		// @ts-expect-error: only a document has sections.
		d.node({ id: "shop-db", kind: "database", title: "DB", links: [{ id: "a", section: "b" }] });
	});
});

test("a Node defined once, as a plain object, can be declared on any Diagram", () => {
	const payments = {
		id: "payments-api",
		kind: "service",
		title: "Payments API",
		links: [{ doc: "docs/payments.md" }],
	} satisfies ArchitectureNode;

	architecture({ title: "Shop" }, (d) => {
		expectTypeOf(d.node(payments)).toEqualTypeOf<NodeHandle>();
	});
	architecture({ title: "Billing" }, (d) => {
		expectTypeOf(d.node(payments)).toEqualTypeOf<NodeHandle>();
	});
});

test("the architecture Notation has three Group Kinds: system, region and zone", () => {
	expectTypeOf<ArchitectureGroupKind>().toEqualTypeOf<"system" | "region" | "zone">();
	architecture({ title: "Shop" }, (d) => {
		// @ts-expect-error: `service` is a Node Kind, not a Group Kind.
		d.group({ id: "shop", kind: "service", title: "Shop" }, () => {});
		// @ts-expect-error: `continent` isn't an architecture Group Kind.
		d.group({ id: "europe", kind: "continent", title: "Europe" }, () => {});
	});
});

test("a Group's callback gets a builder for its members, and declaring a Group returns its handle", () => {
	architecture({ title: "Shop" }, (d) => {
		const region = d.group({ id: "eu-west", kind: "region", title: "EU West" }, (eu) => {
			expectTypeOf(eu).toEqualTypeOf<ArchitectureBuilder>();
		});
		expectTypeOf(region).toEqualTypeOf<GroupHandle>();
		// @ts-expect-error: a Group's members are declared in a callback.
		d.group({ id: "us-east", kind: "region", title: "US East" });
		const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
		// @ts-expect-error: an Edge ends at Nodes, never at a Group.
		d.edge(api, region, { kind: "call" });
	});
});

test("one `system` definition can be a Node on one Diagram and a Group on another", () => {
	const shop = {
		id: "shop",
		kind: "system",
		title: "Shop",
		links: [{ doc: "docs/shop.md" }],
	} satisfies ArchitectureNode;

	architecture({ title: "Overview" }, (d) => {
		d.node(shop);
	});
	architecture({ title: "Shop" }, (d) => {
		d.group(shop, (group) => {
			group.node({ id: "shop-api", kind: "service", title: "Shop API" });
		});
		d.group({ id: "eu-west", kind: "region", title: "EU West", description: "Europe" }, () => {});
		// @ts-expect-error: a description is text.
		d.group({ id: "us-east", kind: "region", title: "US East", description: 7 }, () => {});
	});
});

test("a Diagram and a Node take a description, as a Group does, which is text", () => {
	architecture({ title: "Shop", description: "How the shop takes orders." }, (d) => {
		d.node({ id: "shop-api", kind: "service", title: "Shop API", description: "Takes orders." });
		// @ts-expect-error: a description is text.
		d.node({ id: "shop-db", kind: "database", title: "Shop database", description: 7 });
	});
	// @ts-expect-error: a description is text.
	architecture({ title: "Stock", description: ["Counts"] }, () => {});
});

test("the Atlas config types context entries and their glossary paths", () => {
	atlas({});
	atlas({ contexts: { billing: { glossary: "billing/GLOSSARY.md" } } });
	// @ts-expect-error: a context entry names its glossary path.
	atlas({ contexts: { billing: "billing/GLOSSARY.md" } });
	// @ts-expect-error: a glossary path is text.
	atlas({ contexts: { billing: { glossary: 7 } } });
	// @ts-expect-error: the config has no such setting.
	atlas({ contxts: {} });
});

test("a status that the Notation doesn't have is a type error", () => {
	architecture({ title: "Shop" }, (d) => {
		d.node({ id: "shop-api", kind: "service", title: "Shop API", status: "degraded" });
		// @ts-expect-error: `broken` isn't a status.
		d.node({ id: "shop-db", kind: "database", title: "Shop database", status: "broken" });
	});
});

test("`technology` autocompletes the slugs that have a logo, and accepts any other", () => {
	/**
	 * The slugs an editor offers for a type: its string literals. A union that
	 * widens to `string` has none.
	 */
	type Offered<T> = T extends string ? (string extends T ? never : T) : never;

	for (const known of ["postgres", "go", "nodejs", "google-cloud"] as const) {
		expectTypeOf(known).toExtend<KnownTechnology>();
	}
	expectTypeOf<"our-own-bus">().not.toExtend<KnownTechnology>();
	expectTypeOf<Offered<Technology>>().toEqualTypeOf<KnownTechnology>();
	expectTypeOf<
		Offered<Exclude<ArchitectureNode["technology"], undefined>>
	>().toEqualTypeOf<KnownTechnology>();
	expectTypeOf<
		Offered<Exclude<EdgeOptions["technology"], undefined>>
	>().toEqualTypeOf<KnownTechnology>();
	expectTypeOf<string>().toExtend<NonNullable<ArchitectureNode["technology"]>>();
	expectTypeOf<string>().toExtend<NonNullable<EdgeOptions["technology"]>>();

	architecture({ title: "Shop" }, (d) => {
		const api = d.node({ id: "shop-api", kind: "service", title: "Shop API", technology: "go" });
		const bus = d.node({ id: "bus", kind: "queue", title: "Bus", technology: "our-own-bus" });
		d.edge(api, bus, { kind: "message", technology: "our-own-protocol" });
		// @ts-expect-error: a Technology is a slug, written as a string.
		d.node({ id: "shop-db", kind: "database", title: "Shop database", technology: 7 });
	});
});

test("the scene's types are exported for tests and future renderers, logos included", () => {
	expectTypeOf<SceneNode["logo"]>().toEqualTypeOf<SceneLogo | undefined>();
	expectTypeOf<SceneLabel["logo"]>().toEqualTypeOf<SceneLogo | undefined>();
	expectTypeOf<SceneLogo["technology"]>().toEqualTypeOf<string>();
});
