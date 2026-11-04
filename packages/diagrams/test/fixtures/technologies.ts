import { architecture } from "../../src/index.ts";

/**
 * An orders flow whose Nodes and Edges say what they're built with: Nodes
 * with a logo, one beside a status mark; a Node whose slug has no logo, so it
 * shows its name only; and Edge labels with a logo, and without one.
 */
export default architecture({ title: "Orders" }, (d) => {
	const web = d.node({
		id: "shop-web",
		kind: "client",
		title: "Shop web app",
		technology: "typescript",
	});
	const api = d.node({
		id: "orders-api",
		kind: "service",
		title: "Orders API",
		technology: "go",
		status: "ok",
	});
	const db = d.node({
		id: "orders-db",
		kind: "database",
		title: "Orders DB",
		technology: "postgres",
	});
	const events = d.node({
		id: "order-events",
		kind: "queue",
		title: "Order events",
		technology: "rabbitmq",
	});
	const ledger = d.node({
		id: "ledger",
		kind: "service",
		title: "Ledger",
		technology: "our-ledger",
	});

	d.edge(web, api, { kind: "call", label: "Places orders", technology: "graphql", rate: "30/s" });
	d.edge(api, db, { kind: "call", technology: "postgres" });
	d.edge(api, events, { kind: "message", label: "Announces orders" });
	d.edge(events, ledger, { kind: "message", label: "Posts entries", technology: "amqp" });
});
