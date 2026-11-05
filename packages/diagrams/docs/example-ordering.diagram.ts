import { domain } from "@the-platform/diagrams";
import { ordering, orderPlaced } from "./shared/ordering.ts";

/** The home of the event that Billing's aggregate diagram borrows. */
export default domain({ title: "Ordering aggregates" }, (d) => {
	d.group(ordering, (ordering) => {
		const order = ordering.node({
			id: "order",
			kind: "aggregate",
			title: "Order",
			rows: [{ name: "OrderLine", value: "entity" }],
		});
		const placed = ordering.node(orderPlaced);
		ordering.edge(order, placed, { kind: "emits" });
	});
});
