import {
	type ArchitectureBuilder,
	type ArchitectureNodeKind,
	type ArchitectureNotation,
	architecture,
	type DiagramOf,
	type Direction,
} from "../../src/index.ts";

/**
 * The crowded fixture (spec: Seam 1, Speed): an online shop of about 60
 * Nodes and 150 Edges, in several nested Groups. The API gateway fans out to
 * fourteen services in the EU region, two ranks on, past the auth service and
 * the rate limiter. Layout counts the region as one block there, so the whole
 * fan-out passes that rank through one corridor, which it overfills.
 */
export function crowded(direction: Direction = "right"): DiagramOf<ArchitectureNotation> {
	return architecture({ id: "crowded", title: "Online shop", direction }, (d) => {
		const node = (builder: ArchitectureBuilder, id: string, kind: ArchitectureNodeKind) =>
			builder.node({ id, kind, title: titleOf(id) });

		for (const [id, kind] of clients) {
			node(d, id, kind);
		}
		node(d, "api-gateway", "gateway");
		node(d, "cdn", "gateway");
		node(d, "auth-service", "service");
		node(d, "rate-limiter", "cache");
		node(d, "feature-flags", "service");
		d.group({ id: "eu-west", kind: "region", title: "EU West" }, (region) => {
			region.group({ id: "eu-west-a", kind: "zone", title: "Zone A" }, (zone) => {
				for (const [id, kind] of zoneA) {
					node(zone, id, kind);
				}
				zone.group({ id: "payments", kind: "system", title: "Payments" }, (system) => {
					for (const [id, kind] of payments) {
						node(system, id, kind);
					}
				});
			});
			region.group({ id: "eu-west-b", kind: "zone", title: "Zone B" }, (zone) => {
				for (const [id, kind] of zoneB) {
					node(zone, id, kind);
				}
				zone.group({ id: "catalog", kind: "system", title: "Catalog" }, (system) => {
					for (const [id, kind] of catalog) {
						node(system, id, kind);
					}
				});
			});
			region.group({ id: "messaging", kind: "system", title: "Messaging" }, (system) => {
				for (const [id, kind] of messaging) {
					node(system, id, kind);
				}
			});
			region.group({ id: "fulfilment", kind: "system", title: "Fulfilment" }, (system) => {
				for (const [id, kind] of fulfilment) {
					node(system, id, kind);
				}
			});
			for (const [id, kind] of workers) {
				node(region, id, kind);
			}
		});
		d.group({ id: "us-east", kind: "region", title: "US East" }, (region) => {
			region.group({ id: "us-east-a", kind: "zone", title: "Zone A" }, (zone) => {
				for (const [id, kind] of replicas) {
					node(zone, id, kind);
				}
			});
		});
		d.group({ id: "observability", kind: "system", title: "Observability" }, (system) => {
			for (const [id, kind] of observability) {
				node(system, id, kind);
			}
		});
		for (const id of externals) {
			d.node({ id, kind: "system", title: titleOf(id), external: true });
		}

		for (const [from, to, id] of calls) {
			d.edge(from, to, { kind: "call", ...(id === undefined ? {} : { id }) });
		}
		for (const [from, to, id] of messages) {
			d.edge(from, to, { kind: "message", ...(id === undefined ? {} : { id }) });
		}
	});
}

/** `orders-api` is titled "Orders API". */
function titleOf(id: string): string {
	const words = id.split("-").map((word) => (word === "api" ? "API" : word));
	const [first = "", ...rest] = words;
	return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(" ");
}

type Declared = [id: string, kind: ArchitectureNodeKind];

const clients: Declared[] = [
	["web-app", "client"],
	["mobile-app", "client"],
	["admin-app", "client"],
	["partner-portal", "client"],
];

const zoneA: Declared[] = [
	["orders-api", "service"],
	["cart-api", "service"],
	["users-api", "service"],
	["orders-db", "database"],
	["cart-cache", "cache"],
	["users-db", "database"],
	["session-cache", "cache"],
];

const payments: Declared[] = [
	["payments-api", "service"],
	["payments-db", "database"],
	["fraud-worker", "worker"],
];

const zoneB: Declared[] = [
	["search-api", "service"],
	["inventory-api", "service"],
	["reviews-api", "service"],
	["pricing-api", "service"],
	["promotions-api", "service"],
	["recs-api", "service"],
	["search-index", "search"],
	["inventory-db", "database"],
	["reviews-db", "database"],
	["recs-cache", "cache"],
];

const catalog: Declared[] = [
	["catalog-api", "service"],
	["catalog-db", "database"],
	["image-resizer", "function"],
	["product-images", "storage"],
];

const messaging: Declared[] = [
	["order-events", "queue"],
	["payment-events", "queue"],
	["inventory-events", "queue"],
	["notifications", "queue"],
];

const fulfilment: Declared[] = [
	["shipping-api", "service"],
	["picker", "worker"],
	["label-printer", "function"],
	["shipping-db", "database"],
];

const workers: Declared[] = [
	["email-worker", "worker"],
	["sms-worker", "worker"],
	["analytics-worker", "worker"],
	["invoice-worker", "worker"],
	["admin-api", "service"],
	["report-api", "service"],
	["audit-log", "storage"],
];

const replicas: Declared[] = [
	["orders-replica", "database"],
	["search-replica", "search"],
	["report-worker", "worker"],
];

const observability: Declared[] = [
	["logs", "storage"],
	["metrics", "storage"],
	["tracing", "service"],
	["alerting", "function"],
];

const externals = ["payment-provider", "email-provider", "sms-provider", "shipping-carrier"];

/** The services the API gateway fans out to. */
const fanOut = [
	"orders-api",
	"cart-api",
	"users-api",
	"payments-api",
	"catalog-api",
	"search-api",
	"inventory-api",
	"reviews-api",
	"pricing-api",
	"promotions-api",
	"recs-api",
	"shipping-api",
	"admin-api",
	"report-api",
];

/** Each service and the store it owns. */
const stores: Joined[] = [
	["orders-api", "orders-db"],
	["cart-api", "cart-cache"],
	["users-api", "users-db"],
	["payments-api", "payments-db"],
	["catalog-api", "catalog-db"],
	["search-api", "search-index"],
	["inventory-api", "inventory-db"],
	["reviews-api", "reviews-db"],
	["pricing-api", "catalog-db"],
	["promotions-api", "catalog-db"],
	["recs-api", "recs-cache"],
	["shipping-api", "shipping-db"],
	["admin-api", "audit-log", "admin-writes"],
	["report-api", "orders-replica"],
];

/** The services that write logs. */
const logged = [
	"api-gateway",
	"orders-api",
	"cart-api",
	"users-api",
	"payments-api",
	"catalog-api",
	"search-api",
	"inventory-api",
	"shipping-api",
	"admin-api",
];

/** The services that send traces. */
const traced = [
	"api-gateway",
	"orders-api",
	"cart-api",
	"users-api",
	"payments-api",
	"catalog-api",
	"search-api",
	"inventory-api",
	"shipping-api",
	"admin-api",
	"report-api",
];

type Joined = [from: string, to: string, id?: string];

const calls: Joined[] = [
	...clients.map(([id]): Joined => [id, "api-gateway"]),
	["web-app", "cdn"],
	["mobile-app", "cdn"],
	["cdn", "product-images"],
	["api-gateway", "auth-service"],
	["api-gateway", "rate-limiter"],
	["api-gateway", "feature-flags"],
	["auth-service", "users-api"],
	["auth-service", "session-cache"],
	["rate-limiter", "session-cache"],
	["feature-flags", "users-db"],
	...fanOut.map((id): Joined => ["api-gateway", id]),
	...stores,
	["orders-api", "payments-api", "orders-charge"],
	["orders-api", "payments-api", "orders-refund"],
	["orders-api", "inventory-api"],
	["orders-api", "cart-api"],
	["orders-api", "users-api"],
	["orders-api", "pricing-api"],
	["cart-api", "pricing-api"],
	["cart-api", "promotions-api"],
	["cart-api", "inventory-api"],
	["cart-api", "session-cache"],
	["users-api", "session-cache"],
	["payments-api", "payment-provider"],
	["search-api", "catalog-api"],
	["recs-api", "search-api"],
	["recs-api", "orders-replica"],
	["catalog-api", "product-images"],
	["catalog-api", "image-resizer"],
	["image-resizer", "product-images"],
	["pricing-api", "promotions-api"],
	["shipping-api", "shipping-carrier"],
	["admin-api", "orders-api"],
	["admin-api", "users-api"],
	["admin-api", "catalog-api"],
	["report-api", "search-replica"],
	["report-api", "report-worker"],
	["report-worker", "orders-replica"],
	["report-worker", "search-replica"],
	["invoice-worker", "payments-db"],
	["fraud-worker", "orders-api"],
	["picker", "shipping-db"],
	["picker", "label-printer"],
	["label-printer", "shipping-carrier"],
	["email-worker", "email-provider"],
	["sms-worker", "sms-provider"],
	["analytics-worker", "metrics"],
	["analytics-worker", "recs-api"],
	["payment-provider", "payments-api", "payment-webhooks"],
	["shipping-carrier", "shipping-api", "tracking-webhooks"],
	["tracing", "metrics"],
	["metrics", "alerting"],
	["alerting", "email-provider"],
	["alerting", "sms-provider"],
	["logs", "alerting"],
	["web-app", "auth-service"],
	["mobile-app", "auth-service"],
	["partner-portal", "cdn"],
	["reviews-api", "users-api"],
	["reviews-api", "catalog-api"],
	["promotions-api", "users-api"],
	["inventory-api", "catalog-api"],
	["shipping-api", "orders-api"],
	["shipping-api", "inventory-api"],
	["invoice-worker", "orders-api"],
	["analytics-worker", "orders-replica"],
	["report-worker", "metrics"],
	["feature-flags", "session-cache"],
	...traced.map((id): Joined => [id, "tracing"]),
];

const messages: Joined[] = [
	["orders-api", "order-events"],
	["payments-api", "payment-events"],
	["inventory-api", "inventory-events"],
	["orders-api", "notifications"],
	["payments-api", "notifications"],
	["shipping-api", "notifications"],
	["order-events", "email-worker"],
	["order-events", "analytics-worker"],
	["order-events", "invoice-worker"],
	["order-events", "shipping-api"],
	["payment-events", "fraud-worker"],
	["payment-events", "invoice-worker"],
	["payment-events", "analytics-worker"],
	["inventory-events", "search-api"],
	["inventory-events", "analytics-worker"],
	["notifications", "email-worker"],
	["notifications", "sms-worker"],
	["shipping-api", "picker"],
	["orders-db", "orders-replica"],
	["search-index", "search-replica"],
	["admin-api", "audit-log", "admin-audit"],
	["email-provider", "notifications", "email-bounces"],
	["catalog-api", "inventory-events"],
	["reviews-api", "notifications"],
	["users-api", "notifications"],
	["fraud-worker", "payment-events"],
	...["api-gateway", "orders-api", "payments-api"].map((id): Joined => [id, "metrics"]),
	...logged.map((id): Joined => [id, "logs"]),
];
