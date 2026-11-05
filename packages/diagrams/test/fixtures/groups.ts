import {
	type ArchitectureNotation,
	architecture,
	type DiagramOf,
	type Direction,
} from "../../src/index.ts";

/** Each fixture here is an architecture Diagram. */
type Diagram = DiagramOf<ArchitectureNotation>;

/**
 * The web app calls the Shop API in a region. The region's zone holds the
 * API's database and cache, and the Mailer sits in the region, beside it.
 */
export function region(direction: Direction): Diagram {
	return architecture({ id: "region", title: "Region", direction }, (d) => {
		const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
		d.group({ id: "eu-west", kind: "region", title: "EU West" }, (eu) => {
			const api = eu.node({ id: "shop-api", kind: "service", title: "Shop API" });
			eu.group({ id: "eu-west-a", kind: "zone", title: "Zone A" }, (zone) => {
				const db = zone.node({ id: "shop-db", kind: "database", title: "Shop database" });
				const cache = zone.node({ id: "shop-cache", kind: "cache", title: "Shop cache" });
				d.edge(api, db, { kind: "call" });
				d.edge(api, cache, { kind: "call" });
			});
			const mailer = eu.node({ id: "mailer", kind: "worker", title: "Mailer" });
			d.edge(api, mailer, { kind: "message" });
			d.edge(web, api, { kind: "call" });
		});
	});
}

/**
 * Two regions, each with an API and its database, both called by one web app.
 * The EU API also writes to the US database, across the regions.
 */
export function twoRegions(direction: Direction): Diagram {
	return architecture({ id: "two-regions", title: "Two regions", direction }, (d) => {
		const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
		for (const [id, title] of [
			["eu", "EU"],
			["us", "US"],
		] as const) {
			d.group({ id: `${id}-region`, kind: "region", title }, (group) => {
				const api = group.node({ id: `${id}-api`, kind: "service", title: `${title} API` });
				const db = group.node({ id: `${id}-db`, kind: "database", title: `${title} database` });
				d.edge(web, api, { kind: "call" });
				d.edge(api, db, { kind: "call" });
			});
		}
		d.edge("eu-api", "us-db", { kind: "call" });
	});
}

/**
 * A system inside a region, inside a zone, with a Node at every level, and a
 * Group that holds only another Group. The ledger calls back up to the API.
 */
export function deepNesting(direction: Direction): Diagram {
	return architecture({ id: "deep-nesting", title: "Deep nesting", direction }, (d) => {
		const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
		d.group({ id: "eu-west", kind: "region", title: "EU West" }, (eu) => {
			const gateway = eu.node({ id: "gateway", kind: "gateway", title: "Gateway" });
			d.edge(web, gateway, { kind: "call" });
			eu.group({ id: "eu-west-a", kind: "zone", title: "Zone A" }, (zone) => {
				zone.group({ id: "billing", kind: "system", title: "Billing" }, (billing) => {
					const api = billing.node({ id: "billing-api", kind: "service", title: "Billing API" });
					const ledger = billing.node({ id: "ledger", kind: "worker", title: "Ledger" });
					d.edge(gateway, api, { kind: "call" });
					d.edge(api, ledger, { kind: "message" });
					d.edge(ledger, api, { kind: "call" });
				});
			});
			eu.group({ id: "eu-west-b", kind: "zone", title: "Zone B" }, () => {});
		});
	});
}

/**
 * The web app calls the Payments API, whose system has a long title. Drawn
 * down, the system's label lies between the two, right in the Edge's way.
 */
export function labelInTheWay(direction: Direction): Diagram {
	return architecture({ id: "label-in-the-way", title: "Label in the way", direction }, (d) => {
		const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
		d.group({ id: "payments", kind: "system", title: "Payments and refunds" }, (payments) => {
			const api = payments.node({ id: "payments-api", kind: "service", title: "Payments API" });
			d.edge(web, api, { kind: "call" });
		});
	});
}

/**
 * The web app, in a system of its own, calls two APIs in a zone inside a
 * region. Drawn right, the orders API sits two Groups deep, so its Ports come
 * level with the top of the web app's system, and a grid line runs along
 * that border.
 */
export function portLevelWithBorder(direction: Direction): Diagram {
	return architecture(
		{ id: "port-level-with-border", title: "Port level with a border", direction },
		(d) => {
			d.group({ id: "storefront", kind: "system", title: "Storefront" }, (storefront) => {
				storefront.node({ id: "web-app", kind: "client", title: "Web app" });
			});
			d.group({ id: "eu-west", kind: "region", title: "EU West" }, (eu) => {
				eu.group({ id: "eu-west-a", kind: "zone", title: "Zone A" }, (zone) => {
					zone.node({ id: "orders-api", kind: "service", title: "Orders API" });
					zone.node({ id: "stock-api", kind: "service", title: "Stock API" });
				});
			});
			d.edge("web-app", "stock-api", { kind: "call" });
			d.edge("web-app", "orders-api", { kind: "call" });
		},
	);
}

/**
 * Nodes with callouts and Rows in nested Groups. The Orders API's tag sits at
 * the top of its region, just below the region's label, and Edges leave and
 * enter the queue's Rows inside the zone.
 */
export function rowsAndCallouts(direction: Direction): Diagram {
	return architecture({ id: "rows-and-callouts", title: "Rows and callouts", direction }, (d) => {
		const web = d.node({ id: "web-app", kind: "client", title: "Web app", callout: "Beta" });
		d.group({ id: "eu-west", kind: "region", title: "EU West" }, (eu) => {
			const api = eu.node({
				id: "orders-api",
				kind: "service",
				title: "Orders API",
				callout: "SPOF",
				rows: [{ name: "replicas", value: "1" }],
			});
			d.edge(web, api, { kind: "call" });
			eu.group({ id: "eu-west-a", kind: "zone", title: "Zone A" }, (zone) => {
				const events = zone.node({
					id: "order-events",
					kind: "queue",
					title: "Order events",
					rows: [{ name: "order-placed" }, { name: "order-paid" }],
				});
				const db = zone.node({
					id: "orders-db",
					kind: "database",
					title: "Orders database",
					callout: "Slow",
				});
				d.edge(api, events.row("order-placed"), { kind: "message" });
				d.edge(events.row("order-paid"), api, { kind: "message" });
				d.edge(api, db, { kind: "call" });
			});
		});
	});
}

/** Every Group fixture, for the properties that hold on all of them. */
export const groupFixtures: [string, (direction: Direction) => Diagram][] = [
	["a region with a zone", region],
	["two regions", twoRegions],
	["deep nesting", deepNesting],
	["a label in the way", labelInTheWay],
	["a Port level with a Group's border", portLevelWithBorder],
	["Rows and callouts in Groups", rowsAndCallouts],
];
