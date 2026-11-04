import { architecture } from "@the-platform/diagrams";

/**
 * A small example system: a shopper, the shop's web app, gateway, two
 * services, database and queue, and a payment provider we don't run. The
 * shop's backend runs in one region, and the Orders API, its database and its
 * queue run in one zone of it. A fraud check runs in another region, so the
 * call to it crosses regions. A few Edges say what they carry, and a few
 * Nodes and Edges what they're built with.
 */
export default architecture({ title: "Example system" }, (d) => {
	const shopper = d.node({ id: "shopper", kind: "person", title: "Shopper" });
	const web = d.node({
		id: "shop-web",
		kind: "client",
		title: "Shop web app",
		technology: "typescript",
	});
	d.edge(shopper, web, { kind: "call" });

	d.group({ id: "eu-west", kind: "region", title: "EU West" }, (region) => {
		const gateway = region.node({ id: "shop-gateway", kind: "gateway", title: "Shop gateway" });
		const payments = region.node({
			id: "payments-api",
			kind: "service",
			title: "Payments API",
			status: "degraded",
			rows: [{ name: "replicas", value: "2" }],
		});
		d.edge(web, gateway, {
			kind: "call",
			label: "Places orders",
			technology: "graphql",
			rate: "30/s",
		});

		region.group({ id: "eu-west-a", kind: "zone", title: "Zone A" }, (zone) => {
			const orders = zone.node({
				id: "orders-api",
				kind: "service",
				title: "Orders API",
				technology: "go",
				rows: [{ name: "replicas", value: "3" }],
			});
			const db = zone.node({
				id: "orders-db",
				kind: "database",
				title: "Orders database",
				rows: [
					{ name: "region", value: "eu-west-1" },
					{ name: "replicas", value: "2" },
				],
			});
			const events = zone.node({
				id: "order-events",
				kind: "queue",
				title: "Order events",
				technology: "rabbitmq",
				rows: [{ name: "order-placed" }, { name: "order-cancelled" }],
			});
			d.edge(gateway, orders, { kind: "call", label: "Creates orders", technology: "grpc" });
			d.edge(orders, db, { kind: "call", technology: "postgres" });
			d.edge(orders, events, { kind: "message", label: "Announces orders" });
			d.edge(events.row("order-placed"), payments, { kind: "message" });
		});
	});

	const provider = d.node({
		id: "payment-provider",
		kind: "system",
		title: "Payment provider",
		external: true,
	});
	d.edge("payments-api", provider, { kind: "call", label: "Charges cards" });

	d.group({ id: "us-east", kind: "region", title: "US East" }, (region) => {
		const fraud = region.node({ id: "fraud-check", kind: "service", title: "Fraud check" });
		d.edge("payments-api", fraud, { kind: "call" });
	});
});
