import { expectTypeOf, test } from "vitest";
import {
	architecture,
	type DiagramOf,
	type DomainBuilder,
	type DomainEdgeKind,
	type DomainEdgeOptions,
	type DomainNode,
	type DomainNodeKind,
	type DomainNotation,
	type DomainRole,
	domain,
	type NodeHandle,
	type RoleOf,
} from "../src/index.ts";

test("the domain Notation has one Node Kind, `context`, and four Edge Kinds", () => {
	expectTypeOf<DomainNodeKind>().toEqualTypeOf<"context">();
	expectTypeOf<DomainEdgeKind>().toEqualTypeOf<
		"partnership" | "shared-kernel" | "upstream-downstream" | "customer-supplier"
	>();
});

test("a Node Kind that the Notation doesn't have is a type error", () => {
	domain({ title: "Shop" }, (d) => {
		expectTypeOf(d).toEqualTypeOf<DomainBuilder>();
		const catalog = d.node({ id: "catalog", kind: "context", title: "Catalog" });
		expectTypeOf(catalog).toEqualTypeOf<NodeHandle>();
		// @ts-expect-error: `contxt` isn't a domain Kind.
		d.node({ id: "ordering", kind: "contxt", title: "Ordering" });
		// @ts-expect-error: `service` is a Kind of the architecture Notation.
		d.node({ id: "billing", kind: "service", title: "Billing" });
	});
});

test("an Edge Kind that the Notation doesn't have is a type error", () => {
	domain({ title: "Shop" }, (d) => {
		const catalog = d.node({ id: "catalog", kind: "context", title: "Catalog" });
		const ordering = d.node({ id: "ordering", kind: "context", title: "Ordering" });
		d.edge(catalog, ordering, { kind: "upstream-downstream" });
		d.edge(catalog, ordering, { kind: "customer-supplier", id: "supplies" });
		d.edge(catalog, ordering, { kind: "partnership", id: "partners" });
		d.edge(catalog, ordering, { kind: "shared-kernel", id: "shares" });
		// @ts-expect-error: `upstream` isn't a domain Edge Kind.
		d.edge(catalog, ordering, { kind: "upstream", id: "typo" });
		// @ts-expect-error: `call` is an Edge Kind of the architecture Notation.
		d.edge(catalog, ordering, { kind: "call", id: "calls" });
	});
});

test("a context map has no Groups, so declaring one is a type error", () => {
	domain({ title: "Shop" }, (d) => {
		// @ts-expect-error: the domain Notation has no Group Kinds.
		d.group({ id: "sales", kind: "subdomain", title: "Sales" }, () => {});
	});
});

test("a context takes the options that a context map's Nodes have, and no others", () => {
	domain({ title: "Shop" }, (d) => {
		d.node({ id: "card-payments", kind: "context", title: "Card payments", external: true });
		// @ts-expect-error: a context has no Technology.
		d.node({ id: "catalog", kind: "context", title: "Catalog", technology: "go" });
		// @ts-expect-error: a context has no status.
		d.node({ id: "ordering", kind: "context", title: "Ordering", status: "ok" });
		// @ts-expect-error: a context has no callout.
		d.node({ id: "billing", kind: "context", title: "Billing", callout: "legacy" });
	});
});

test("a context defined once, as a plain object, can be declared on any Diagram", () => {
	const billing = { id: "billing", kind: "context", title: "Billing" } satisfies DomainNode;

	domain({ title: "Shop" }, (d) => {
		expectTypeOf(d.node(billing)).toEqualTypeOf<NodeHandle>();
	});
	domain({ title: "Payments" }, (d) => {
		expectTypeOf(d.node(billing)).toEqualTypeOf<NodeHandle>();
	});
});

test("the domain Notation has four roles, which an Edge's ends carry", () => {
	expectTypeOf<DomainRole>().toEqualTypeOf<"OHS" | "PL" | "CF" | "ACL">();
	expectTypeOf<RoleOf<DomainNotation>>().toEqualTypeOf<DomainRole>();
	expectTypeOf<DomainEdgeOptions["roles"]>().toEqualTypeOf<
		{ from?: readonly DomainRole[]; to?: readonly DomainRole[] } | undefined
	>();
	// The model holds them as the builder was given them.
	expectTypeOf<DiagramOf<DomainNotation>["edges"][number]["roles"]>().toEqualTypeOf<
		{ from?: DomainRole[]; to?: DomainRole[] } | undefined
	>();
});

test("a role that the Notation doesn't have is a type error", () => {
	domain({ title: "Shop" }, (d) => {
		const catalog = d.node({ id: "catalog", kind: "context", title: "Catalog" });
		const ordering = d.node({ id: "ordering", kind: "context", title: "Ordering" });
		d.edge(catalog, ordering, {
			kind: "upstream-downstream",
			roles: { from: ["OHS", "PL"], to: ["ACL"] },
		});
		d.edge(catalog, ordering, { kind: "customer-supplier", id: "supplies", roles: { to: ["CF"] } });
		d.edge(catalog, ordering, {
			kind: "upstream-downstream",
			id: "typo",
			// @ts-expect-error: `OSH` isn't a role of the domain Notation.
			roles: { from: ["OSH"] },
		});
		d.edge(catalog, ordering, {
			kind: "upstream-downstream",
			id: "lower",
			// @ts-expect-error: a role is written in capitals, as its tag shows it.
			roles: { to: ["acl"] },
		});
		d.edge(catalog, ordering, {
			kind: "upstream-downstream",
			id: "ends",
			// @ts-expect-error: an Edge's ends are `from` and `to`.
			roles: { upstream: ["OHS"] },
		});
		d.edge(catalog, ordering, {
			kind: "upstream-downstream",
			id: "bare",
			// @ts-expect-error: each end's roles are a list.
			roles: { from: "OHS" },
		});
	});
});

test("an architecture Edge carries no roles", () => {
	architecture({ title: "Shop" }, (d) => {
		const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
		const db = d.node({ id: "shop-db", kind: "database", title: "Shop database" });
		// @ts-expect-error: the architecture Notation has no roles.
		d.edge(api, db, { kind: "call", roles: { from: ["OHS"] } });
	});
});
