import { domain } from "@the-platform/diagrams";
import { orderPlaced } from "./shared/ordering.ts";

/** Billing reacts to Ordering's event, references an account and emits its own event. */
export default domain({ title: "Billing aggregates" }, (d) => {
	d.node(orderPlaced);
	d.group({ id: "billing", kind: "context", title: "Billing" }, (billing) => {
		const invoice = billing.node({
			id: "invoice",
			kind: "aggregate",
			title: "Invoice",
			rows: [
				{ name: "InvoiceLine", value: "entity" },
				{ name: "Money", value: "value object" },
				{ name: "Total >= 0", value: "invariant" },
			],
		});
		const account = billing.node({ id: "account", kind: "aggregate", title: "Account" });
		const issued = billing.node({ id: "invoice-issued", kind: "event", title: "Invoice issued" });
		billing.edge(invoice, account, { kind: "references" });
		billing.edge(invoice, issued, { kind: "emits" });
		billing.edge("ordering/order-placed", invoice, { kind: "reacts" });
	});
});
