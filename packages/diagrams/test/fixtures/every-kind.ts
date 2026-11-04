import { architecture } from "../../src/index.ts";

/** One Node of each architecture Kind, joined by both Edge Kinds. */
export default architecture({ title: "Every architecture Kind" }, (d) => {
	const shopper = d.node({ id: "shopper", kind: "person", title: "Shopper" });
	const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
	const cdn = d.node({ id: "edge-cdn", kind: "gateway", title: "CDN" });
	const shop = d.node({ id: "shop", kind: "system", title: "Shop" });
	const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
	const resize = d.node({ id: "resize-image", kind: "function", title: "Resize image" });
	const mailer = d.node({ id: "mailer", kind: "worker", title: "Mailer" });
	const db = d.node({ id: "shop-db", kind: "database", title: "Shop database" });
	const cache = d.node({ id: "session-cache", kind: "cache", title: "Session cache" });
	const events = d.node({ id: "shop-events", kind: "queue", title: "Shop events" });
	const images = d.node({ id: "image-store", kind: "storage", title: "Image store" });
	const search = d.node({ id: "product-search", kind: "search", title: "Product search" });

	d.edge(shopper, web, { kind: "call" });
	d.edge(web, cdn, { kind: "call" });
	d.edge(cdn, shop, { kind: "call" });
	d.edge(shop, api, { kind: "call" });
	d.edge(api, db, { kind: "call" });
	d.edge(api, cache, { kind: "call" });
	d.edge(api, search, { kind: "call" });
	d.edge(api, events, { kind: "message" });
	d.edge(events, mailer, { kind: "message" });
	d.edge(events, resize, { kind: "message" });
	d.edge(resize, images, { kind: "call" });
});
