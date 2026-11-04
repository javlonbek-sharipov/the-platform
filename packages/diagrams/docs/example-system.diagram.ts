import { architecture } from "@the-platform/diagrams";

/**
 * A small example system: a shopper, the shop's client, gateway, two
 * services, database and queue, and a payment provider we don't run. Each
 * ticket that adds to the engine extends it.
 */
export default architecture({ title: "Example system" }, (d) => {
	const shopper = d.node({ id: "shopper", kind: "person", title: "Shopper" });
	const web = d.node({ id: "shop-web", kind: "client", title: "Shop web app" });
	const gateway = d.node({ id: "shop-gateway", kind: "gateway", title: "Shop gateway" });
	const orders = d.node({
		id: "orders-api",
		kind: "service",
		title: "Orders API",
		rows: [{ name: "replicas", value: "3" }],
	});
	const payments = d.node({
		id: "payments-api",
		kind: "service",
		title: "Payments API",
		status: "degraded",
		rows: [{ name: "replicas", value: "2" }],
	});
	const db = d.node({
		id: "orders-db",
		kind: "database",
		title: "Orders database",
		rows: [
			{ name: "region", value: "eu-west-1" },
			{ name: "replicas", value: "2" },
		],
	});
	const events = d.node({
		id: "order-events",
		kind: "queue",
		title: "Order events",
		rows: [{ name: "order-placed" }, { name: "order-cancelled" }],
	});
	const provider = d.node({
		id: "payment-provider",
		kind: "system",
		title: "Payment provider",
		external: true,
	});

	d.edge(shopper, web, { kind: "call" });
	d.edge(web, gateway, { kind: "call" });
	d.edge(gateway, orders, { kind: "call" });
	d.edge(orders, db, { kind: "call" });
	d.edge(orders, events, { kind: "message" });
	d.edge(events.row("order-placed"), payments, { kind: "message" });
	d.edge(payments, provider, { kind: "call" });
});
