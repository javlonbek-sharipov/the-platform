---
name: diagrams
description: Drawing Diagrams with @the-platform/diagrams. Use when a doc describes how systems talk, when writing or editing a `*.diagram.ts` module, or when `diagrams lint` fails.
---

# Diagrams

A Diagram is a TypeScript module, `<name>.diagram.ts`, kept next to the doc it illustrates. `diagrams render` draws it into `<name>.diagram.svg` beside it, which the doc shows as an image: `![Example system](./example-system.diagram.svg)`.

## When a Diagram helps

Draw one when readers need to see several systems, services or stores at once: which exist, how they talk, where they run, and which we don't run. Prose suits one thing's insides, and the order in which things happen. The architecture Notation is the only one so far.

## Write the module

Follow the example at the end. `packages/diagrams/src/authoring/architecture.ts` documents every option.

- Import `architecture` from `@the-platform/diagrams`, which resolves anywhere in the repo.
- Declare a Group's Nodes and Groups with the builder its callback gets, as in `region.node(…)`. `d.node(…)` always adds to the Diagram itself.
- An Edge joins two Nodes, each given by its handle or its id.

**Kinds.** Pick the one that says what the thing is.

- Nodes: `person`; `client`, a web or mobile app; `gateway`, an API gateway, load balancer or CDN; `service`; `worker`, for background jobs; `function`, serverless; `database`; `cache`; `queue`; `storage`, for files; `search`, an index; `system`, a whole system as one Node.
- Groups: `region`, and `zone` inside it, for where things run; `system`, around one system's parts.
- Edges: `call` when the sender waits for an answer, `message` when it doesn't.

**Ids** are lowercase words joined by hyphens, named after the thing: `orders-api`. An id names one thing across the Atlas, every Diagram in the repo, so each Diagram that draws it gives it the same Kind and title. A new thing gets a new id. A Node drawn on several Diagrams is defined once, in a shared module imported with its `.ts` extension, as `export const ordersApi = { … } as const satisfies ArchitectureNode`. An Edge's id is `from->to`, so two Edges between the same two Nodes each need an `id` of their own.

**Text.** A title fits in about 16 characters, or 14 beside a logo, and a longer one is cut short. A `label` says what passes over its Edge in two or three words, such as `Places orders`.

**Rows** show a Node's key facts, as strings: `rows: [{ name: "replicas", value: "3" }]`. `handle.row("replicas")` is an Edge end at that Row.

**Technologies** are slugs. Any slug works, and these are drawn with a logo: `alibaba-cloud`, `bun`, `c`, `clickhouse`, `clojure`, `cloudflare`, `cloudflare-workers`, `couchbase`, `cpp`, `dart`, `digitalocean`, `docker`, `dotnet`, `elasticsearch`, `elixir`, `envoy`, `erlang`, `etcd`, `fly-io`, `fsharp`, `go`, `google-cloud`, `google-pubsub`, `graphql`, `haproxy`, `haskell`, `hetzner`, `influxdb`, `kong`, `kotlin`, `kubernetes`, `lua`, `mariadb`, `minio`, `mongodb`, `mosquitto`, `mysql`, `nats`, `neo4j`, `netlify`, `nginx`, `nodejs`, `opensearch`, `ovh`, `postgres`, `python`, `rabbitmq`, `redis`, `scala`, `scaleway`, `scylladb`, `sqlite`, `swift`, `traefik`, `typescript`, `vercel`, `webassembly`.

**Values.** `external: true` marks a Node we don't own or run. A `status` is `ok`, `degraded`, `down` or `unknown`. A `rate` is like `30/s`, `2k/min` or `1.5M/h`. A `callout` is a short tag above its Node, such as `SPOF`.

**Links** point readers from a Node or Group to another id or a doc, and aren't drawn: `links: [{ id: "<id>" }, { doc: "<path from the repo root>", section: "<heading>" }]`.

**Layout** is automatic. Steer it with `direction: "down"` in `architecture`'s options, the nesting of Groups, and the order of declarations, which breaks every tie.

## Finish

Run each command from the repo root, with the module's path for `<module>`:

1. `pnpm exec diagrams render <module>` writes the SVG, or prints the errors that stop it.
2. `pnpm typecheck` catches a misspelled option, which would otherwise vanish without a word. Then `pnpm exec diagrams lint --json` checks the whole Atlas: fix every message it lists, warnings included, and render again, until `messages` is empty. Most messages say their fix. For the others:
   - `label-placement` with no room beside any run: shorten the labels near it, or label fewer Edges.
   - `label-placement` with no run of its own: fix the `fallback-route` warning on that Edge first.
   - `fallback-route`: reorder the declarations, or change `direction`.
3. `pnpm exec diagrams export <module> --format png` prints the path of a PNG. Look at it: every title and label whole, each label beside its own Edge, and every Edge easy to follow. If not, steer the layout and go back to step 1.
4. Commit the module and its SVG together. The pre-commit hook runs Biome and `diagrams lint`; `pnpm exec biome check --write <module>` formats the module.

## Example

The example system, from `packages/diagrams/docs/example-system.diagram.ts`:

```ts
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
```
