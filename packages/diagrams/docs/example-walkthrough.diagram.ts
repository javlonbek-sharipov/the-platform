import { architecture } from "@the-platform/diagrams";

/** Forward, reply, parallel and Node-only Steps on a small checkout Diagram. */
export default architecture({ title: "Checkout Walkthrough" }, (d) => {
	const api = d.node({ id: "walkthrough-api", kind: "service", title: "Checkout API" });
	const orders = d.node({ id: "walkthrough-orders", kind: "database", title: "Orders" });
	const payments = d.node({ id: "walkthrough-payments", kind: "service", title: "Payments" });
	const save = d.edge(api, orders, { id: "save", kind: "call" });
	const charge = d.edge(api, payments, { id: "charge", kind: "call" });
	d.walkthrough({
		id: "place-order",
		title: "Place an order",
		steps: [
			{ edges: [save], note: "Save the order." },
			{ edges: [{ edge: save, back: true }], note: "Return its id." },
			{ edges: [save, charge], note: "Save and charge together." },
			{ node: api, note: "Order placed." },
		],
	});
});
