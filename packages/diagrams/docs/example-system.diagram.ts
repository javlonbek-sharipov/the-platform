import { architecture } from "@the-platform/diagrams";

/**
 * A small example system: a shop's client, gateway, two services, database
 * and queue. Each ticket that adds to the engine extends it.
 */
export default architecture({ title: "Example system" }, (d) => {
	const web = d.node({ id: "shop-web", kind: "client", title: "Shop web app" });
	const gateway = d.node({ id: "shop-gateway", kind: "gateway", title: "Shop gateway" });
	const orders = d.node({ id: "orders-api", kind: "service", title: "Orders API" });
	const payments = d.node({ id: "payments-api", kind: "service", title: "Payments API" });
	const db = d.node({ id: "orders-db", kind: "database", title: "Orders database" });
	const events = d.node({ id: "order-events", kind: "queue", title: "Order events" });

	d.edge(web, gateway, { kind: "call" });
	d.edge(gateway, orders, { kind: "call" });
	d.edge(orders, db, { kind: "call" });
	d.edge(orders, events, { kind: "message" });
	d.edge(events, payments, { kind: "message" });
});
