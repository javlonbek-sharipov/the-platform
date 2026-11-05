---
name: diagrams
description: Drawing Diagrams with @the-platform/diagrams. Use when a doc describes how systems talk or how bounded contexts relate, when writing or editing a `*.diagram.ts` module, or when `diagrams lint` fails.
---

# Diagrams

A Diagram is a TypeScript module, `<name>.diagram.ts`, kept next to the doc it illustrates, or, until a doc shows it, in the `docs/` folder of the package it draws, or of the repo when it spans packages. `diagrams render` draws it into `<name>.diagram.svg` beside it, which the doc shows as an image: `![Example system](./example-system.diagram.svg)`.

## When a Diagram helps

Draw one when readers need to see several things at once, and how they relate. Prose suits one thing's insides, and the order in which things happen. Pick the Notation by what the things are:

- `architecture` draws systems, services and stores: which exist, how they talk, where they run, and which we don't run.
- `domain` draws either a [context map](#context-maps), of bounded contexts and how each side integrates, or an [aggregate diagram](#aggregate-diagrams), of one context's aggregates and domain events. The two forms never mix on one Diagram.

## Write the module

A request that names a Diagram, as in "draw the example system with a cache", asks you to edit that Diagram's module; write a new module when asked for a new Diagram. Follow the example at the end. Each option is the JSON model's field of the same name, which `packages/diagrams/diagram.schema.json` describes. A misspelled option is an error that lists the options there are.

- Import `architecture`, and the `ArchitectureNode` and `ArchitectureGroup` types, from `@the-platform/diagrams`, which resolves anywhere in the repo.
- Declare a Group's Nodes and Groups with the builder its callback gets, as in `region.node(…)`. `d.node(…)` always adds to the Diagram itself.
- An Edge joins two Nodes, each given by its handle or its id.

**Kinds.** Pick the one that says what the thing is.

- Nodes: `person`; `client`, a web or mobile app; `gateway`, an API gateway, load balancer or CDN; `service`; `worker`, for background jobs; `function`, serverless; `database`; `cache`; `queue`; `storage`, for files; `search`, an index; `system`, a whole system as one Node.
- Groups: `region`, and `zone` inside it, for where things run; `system`, around one system's parts.
- Edges: `call` when the sender waits for an answer, `message` when it doesn't.

**Ids** are lowercase words joined by hyphens, named after the thing: `orders-api`. An id names one thing across the Atlas, every Diagram in the repo, so each Diagram that draws it gives it the same Kind and title. A new thing gets a new id. An Edge's id is `from->to`, so two Edges between the same two Nodes each need an `id` of their own.

**Shared definitions.** Whatever several Diagrams draw, a Node or a Group, is defined once, in a plain `.ts` module named for what it defines, in a `shared/` folder beside those Diagrams: `docs/shared/orders.ts`. Import it with its `.ts` extension. Write a Node as `export const ordersApi = { … } as const satisfies ArchitectureNode`, and a Group with `satisfies ArchitectureGroup`. A `system` that is a Node on one Diagram and a Group on another shares one definition, holding only what both take: `id`, `kind`, `title`, `description` and `links`.

**Text.** A title fits in about 16 characters, or 14 beside a logo, and a longer one is cut short. A `label` says what passes over its Edge in two or three words, such as `Places orders`.

**Rows** show a Node's key facts, as strings: `rows: [{ name: "replicas", value: "3" }]`. `handle.row("replicas")` is an Edge end at that Row.

**Technologies** are slugs. Any slug works, and these are drawn with a logo: `alibaba-cloud`, `bun`, `c`, `clickhouse`, `clojure`, `cloudflare`, `cloudflare-workers`, `couchbase`, `cpp`, `dart`, `digitalocean`, `docker`, `dotnet`, `elasticsearch`, `elixir`, `envoy`, `erlang`, `etcd`, `fly-io`, `fsharp`, `go`, `google-cloud`, `google-pubsub`, `graphql`, `haproxy`, `haskell`, `hetzner`, `influxdb`, `kong`, `kotlin`, `kubernetes`, `lua`, `mariadb`, `minio`, `mongodb`, `mosquitto`, `mysql`, `nats`, `neo4j`, `netlify`, `nginx`, `nodejs`, `opensearch`, `ovh`, `postgres`, `python`, `rabbitmq`, `redis`, `scala`, `scaleway`, `scylladb`, `sqlite`, `swift`, `traefik`, `typescript`, `vercel`, `webassembly`.

**Values.** `external: true` marks a Node we don't own or run. A `status` is `ok`, `degraded`, `down` or `unknown`. A `rate` is like `30/s`, `2k/min` or `1.5M/h`. A `callout` is a short tag above its Node, such as `SPOF`.

**Links** point readers from a Node or Group to another id, a [glossary term](#term-links) or a doc, and aren't drawn: `links: [{ id: "<id>" }, { doc: "<path from the repo root>", section: "<heading>" }]`. Each Link names exactly one target and may carry a `label` for its display text. Nor is a `description`, which a Diagram, Node or Group may carry to say more than its title.

**Layout** is automatic. Steer it with `direction: "down"` in `architecture`'s options, the nesting of Groups, and the order of declarations, which breaks every tie.

## Context maps

A context map is written like any other module, with `domain` in place of `architecture`, and `DomainNode` for a context that several Diagrams share. What differs:

- **Nodes.** Each is a `context`, with `external: true` for one we don't own, such as a payment provider's. Use `description` and `links` to explain it. Its title fits in about 17 characters. A context map has no Groups.
- **Edges.** `upstream-downstream` and `customer-supplier` run from the upstream context to the downstream one, so the upstream context, or the supplier, is the Edge's first end. `partnership` and `shared-kernel` run both ways alike, and are drawn without an arrowhead. Two contexts that go separate ways get no Edge. An Edge takes a `label`, and no Technology or rate.
- **Roles.** `roles: { from: […], to: […] }` tags each end of an `upstream-downstream` or `customer-supplier` Edge with how its context integrates. The upstream end, `from`, takes `OHS`, open host service, and `PL`, published language, one or both. The downstream end, `to`, takes `CF`, conformist, or `ACL`, anticorruption layer, one of the two.

The example context map, from `packages/diagrams/docs/example-context-map.diagram.ts`:

```ts
import { domain } from "@the-platform/diagrams";
import { ordering as orderingContext } from "./shared/ordering.ts";

/**
 * A small example context map: the shop's Catalog, Ordering and Shipping
 * contexts, and the context of a card payments provider, which we don't own.
 * Ordering is downstream of two of them. It conforms to the Catalog, which
 * offers an open host service in a published language, and it keeps the
 * provider's model out with an anticorruption layer. Ordering and Shipping
 * are partners. Catalog and Shipping go separate ways, so no Edge joins them.
 */
export default domain({ title: "Example context map" }, (d) => {
	const catalog = d.node({ id: "catalog", kind: "context", title: "Catalog" });
	const cards = d.node({
		id: "card-payments",
		kind: "context",
		title: "Card payments",
		external: true,
	});
	const ordering = d.node(orderingContext);
	const shipping = d.node({ id: "shipping", kind: "context", title: "Shipping" });

	d.edge(catalog, ordering, {
		kind: "upstream-downstream",
		label: "Products",
		roles: { from: ["OHS", "PL"], to: ["CF"] },
	});
	d.edge(cards, ordering, { kind: "upstream-downstream", roles: { to: ["ACL"] } });
	d.edge(ordering, shipping, { kind: "partnership" });
});
```

## Aggregate diagrams

Use `domain` for this form too:

- **Group.** Draw exactly one bounded context as a top-level Group of Kind `context`. Contexts don't nest. A context's id is one kebab-case name, such as `billing`; it can be a Node on a context map and a Group here, sharing its Kind and title.
- **Nodes.** An `aggregate` is one Node standing for its root. Its Rows list entities, value objects and invariants, such as `{ name: "InvoiceLine", value: "entity" }`. A domain event is an `event` Node. Declare all of this context's aggregates and events with the callback's builder.
- **Ids.** Inside that builder, write local ids: `invoice` becomes `billing/invoice` in the JSON model and in handles. Local strings on Edges work there too, even before their Nodes are declared. Outside the callback, name a Node by its full id or handle. Explicit Edge ids stay local to the Diagram, and Links to ids use full Atlas ids. Generated JSON must already hold full ids.
- **Edges.** `references` goes from aggregate to aggregate, dashed; `emits` from aggregate to an event inside its own context, solid; `reacts` from event to aggregate, dotted. Each has an arrowhead and takes a label, with no roles, Technology or rate. An Edge always ends at a Node, never at the context Group.
- **Other contexts' events.** Draw one outside the Group, using its full id, such as `ordering/order-placed`, and react from it into a local aggregate. A member with another context's id inside the Group is an error. Lint warns if no Diagram draws the event inside its own context Group; add that drawing instead of inventing another id.

The example below is `packages/diagrams/docs/example-billing.diagram.ts`. Its shared definition in `docs/shared/ordering.ts`, beside the examples, gives `orderPlaced` the full id `ordering/order-placed`, Kind `event` and title `Order placed`. `docs/example-ordering.diagram.ts` draws it inside Ordering, so both modules belong in the Atlas. Use `DomainNode` for shared Nodes and `DomainGroup` for shared Groups, as the architecture types above are used.

```ts
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
```

A context drawn as a Node on one Diagram and a Group on another can check both types. Its shared definition holds only their common fields:

```ts
import type { DomainGroup, DomainNode } from "@the-platform/diagrams";

export const billing = {
	id: "billing",
	kind: "context",
	title: "Billing",
} as const satisfies DomainNode & DomainGroup;
```

## Term Links

Read `diagrams.config.ts` and the glossary of each context you draw. Its config entry is `contexts: { billing: { glossary: "billing/GLOSSARY.md" } }`, inside `atlas({ … })`; paths start at the Atlas root. Register a context's existing glossary there before linking its terms. A context without an entry is allowed, and gets no glossary checks or term Links. The repo registers `diagrams` at `packages/diagrams/GLOSSARY.md`; the shop examples above are fictional contexts without glossaries here.

A glossary entry is `**Invoice**:` on its own line, its definition below it, and optionally `_Avoid_: bill, payment request`. Keep existing definitions and use their terms in titles, Rows and labels. Add a real missing definition when the task calls for it; keep the glossary's wording when fixing a Diagram.

Use `links: [{ term: "Invoice" }]` on Billing's context-map Node, its context Group, or its `billing/invoice` aggregate. All three use Billing's glossary. In a shared `DomainNode` definition for that aggregate, the Link sits beside `id`, `kind` and `title`, as in the examples above. To link another context's meaning, write `{ term: "Order", context: "ordering", label: "Ordering's order" }`. That context also needs a config entry and glossary. An event borrowed as `ordering/order-placed` uses Ordering's glossary even on Billing's Diagram. An unnamespaced architecture Node needs an explicit `context`. Names match without regard to case or runs of whitespace; use the glossary's spelling.

This complete context map, `packages/diagrams/docs/example-glossary-links.diagram.ts`, uses the repo's registered glossary:

```ts
import { domain } from "@the-platform/diagrams";

/** The Diagrams context leads readers to the language its glossary defines. */
export default domain({ title: "Diagrams language" }, (d) => {
	d.node({
		id: "diagrams",
		kind: "context",
		title: "Diagrams",
		links: [{ term: "Diagram" }, { term: "Atlas" }, { term: "Link" }],
	});
});
```

An event may Link to the existing term it concerns. Inside the Diagrams context's callback, this event points to `Diagram`, whose definition already exists:

```ts
diagrams.node({
	id: "diagram-rendered",
	kind: "event",
	title: "Diagram rendered",
	links: [{ term: "Diagram" }],
});
```

## Walkthroughs

Use a Walkthrough for an ordered explanation on one Diagram, in either `architecture` or `domain`. Call `d.walkthrough({ id, title, steps })` with an id unique among that Diagram's Walkthroughs, a title and at least one Step. Each Step chooses `edges: [...]` or one `node`, and may carry a plain-text `note`. Edges take handles or ids; `{ edge: handleOrId, back: true }` shows a reply from `to` to `from`. Several Edges in one Step run together. A Node takes a handle or id. Every target must be on this Diagram. Inside a context's builder, local Node ids expand as usual; Edge ids stay local to the Diagram.

The web component plays Walkthroughs from their title buttons, with play/pause and Step controls. Escape leaves playback. Reduced motion and host motion-off keep the marks still. The static SVG carries the Steps for the component to play.

This complete example is `packages/diagrams/docs/example-walkthrough.diagram.ts`:

```ts
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
```

## Finish

Run each command from the repo root, with the module's path for `<module>`:

1. `pnpm exec diagrams render <module>` writes the SVG, or prints the errors that stop it.
2. `pnpm exec diagrams lint --json` checks the whole Atlas: fix every message it lists, warnings included, and render again, until `messages` is empty. Most messages say their fix. For the others:
   - `label-placement` with no room beside any run: shorten the labels near it, or label fewer Edges.
   - `label-placement` with no run of its own: fix the `fallback-route` warning on that Edge first.
   - `fallback-route`: reorder the declarations, or change `direction`.
   - `role-placement`: fix a `fallback-route` warning on that Edge first, or else change `direction`.
   - `namespace-home-missing`: draw the event inside its own context Group on another Diagram of the Atlas, using the same full id, Kind and title.
   - `glossary-avoid`: use the suggested term in the Diagram. An Edge between contexts is checked against both glossaries.
   - `broken-link` for a term: check its name, its owning context and that context's config entry. Use an explicit `context` when linking a different glossary.
3. `pnpm exec diagrams export <module> --format png` prints the path of a PNG. Look at it: every title and label whole, each label beside its own Edge, and every Edge easy to follow. If not, steer the layout and go back to step 1.
4. Stage the module and its SVG, and commit them together. The pre-commit hook runs Biome and `diagrams lint --staged`, which judges what's staged, so an SVG left unstaged fails it. `pnpm exec biome check --write <module>` formats the module.

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
