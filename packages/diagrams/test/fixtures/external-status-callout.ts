import { architecture } from "../../src/index.ts";

/** A checkout with an External card network, a Node of each status, and a callout. */
export default architecture({ title: "Checkout" }, (d) => {
	const shopper = d.node({ id: "shopper", kind: "person", title: "Shopper" });
	const checkout = d.node({
		id: "checkout-api",
		kind: "service",
		title: "Checkout API",
		status: "ok",
	});
	const payments = d.node({
		id: "payments-api",
		kind: "service",
		title: "Payments API",
		status: "degraded",
		callout: "single point of failure",
	});
	const network = d.node({
		id: "card-network",
		kind: "system",
		title: "Card network",
		external: true,
		status: "unknown",
	});
	const ledger = d.node({ id: "ledger", kind: "database", title: "Ledger", status: "down" });

	d.edge(shopper, checkout, { kind: "call" });
	d.edge(checkout, payments, { kind: "call" });
	d.edge(payments, network, { kind: "call" });
	d.edge(payments, ledger, { kind: "call" });
});
