import { architecture } from "@the-platform/diagrams";

/**
 * A small example system: a shop's client, gateway, two services, database
 * and queue. Everything but the client runs in one region, and the orders
 * stack runs in one zone of it. Each ticket that adds to the engine extends
 * it.
 */
export default architecture({ title: "Example system" }, (d) => {
	const web = d.node({ id: "shop-web", kind: "client", title: "Shop web app" });
	d.group({ id: "eu-west", kind: "region", title: "EU West" }, (region) => {
		const gateway = region.node({ id: "shop-gateway", kind: "gateway", title: "Shop gateway" });
		d.edge(web, gateway, { kind: "call" });
		region.group({ id: "eu-west-a", kind: "zone", title: "Zone A" }, (zone) => {
			const orders = zone.node({ id: "orders-api", kind: "service", title: "Orders API" });
			const db = zone.node({ id: "orders-db", kind: "database", title: "Orders database" });
			const events = zone.node({ id: "order-events", kind: "queue", title: "Order events" });
			d.edge(gateway, orders, { kind: "call" });
			d.edge(orders, db, { kind: "call" });
			d.edge(orders, events, { kind: "message" });
		});
		const payments = region.node({ id: "payments-api", kind: "service", title: "Payments API" });
		d.edge("order-events", payments, { kind: "message" });
	});
});
