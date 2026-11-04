import { architecture } from "../../src/index.ts";

/**
 * How orders flow, across two zones of one region and into another region.
 * The Orders API calls its database and the Stock API, and announces each
 * order on a queue, so three Edges leave its Port. The queue feeds the Mailer,
 * in the same region, and Analytics, in another. The call to the Stock API
 * crosses zones, and the queue's messages to Analytics cross regions.
 */
export default architecture({ title: "Order flow" }, (d) => {
	const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
	d.group({ id: "eu-west", kind: "region", title: "EU West" }, (eu) => {
		eu.group({ id: "eu-west-a", kind: "zone", title: "Zone A" }, (zone) => {
			const api = zone.node({ id: "orders-api", kind: "service", title: "Orders API" });
			const db = zone.node({ id: "orders-db", kind: "database", title: "Orders database" });
			const events = zone.node({ id: "order-events", kind: "queue", title: "Order events" });
			d.edge(web, api, { kind: "call" });
			d.edge(api, db, { kind: "call" });
			d.edge(api, events, { kind: "message" });
		});
		eu.group({ id: "eu-west-b", kind: "zone", title: "Zone B" }, (zone) => {
			zone.node({ id: "stock-api", kind: "service", title: "Stock API" });
		});
		eu.node({ id: "mailer", kind: "worker", title: "Mailer" });
	});
	d.group({ id: "us-east", kind: "region", title: "US East" }, (us) => {
		us.node({ id: "analytics", kind: "worker", title: "Analytics" });
	});
	d.edge("orders-api", "stock-api", { kind: "call" });
	d.edge("order-events", "mailer", { kind: "message" });
	d.edge("order-events", "analytics", { kind: "message" });
});
