import { type DiagramOf, type Direction, type DomainNotation, domain } from "../../src/index.ts";

/**
 * A shop's context map, with an Edge of each Kind and every role.
 *
 * Ordering is downstream of two contexts: it conforms to the Catalog's
 * published language, and keeps Identity's model out with an anticorruption
 * layer. So two Edges enter it side by side, each with its own roles. It
 * supplies Billing and Shipping, so two Edges leave it, and it's a partner of
 * Support. Billing is downstream of a card payments provider, which we don't
 * own, and shares a kernel with Shipping. Catalog and Support go separate
 * ways, so no Edge joins them.
 */
export function contextMap(direction: Direction): DiagramOf<DomainNotation> {
	return domain({ title: "Shop contexts", direction }, (d) => {
		const catalog = d.node({ id: "catalog", kind: "context", title: "Catalog" });
		const identity = d.node({ id: "identity", kind: "context", title: "Identity" });
		const ordering = d.node({ id: "ordering", kind: "context", title: "Ordering" });
		const billing = d.node({ id: "billing", kind: "context", title: "Billing" });
		const shipping = d.node({ id: "shipping", kind: "context", title: "Shipping" });
		const payments = d.node({
			id: "card-payments",
			kind: "context",
			title: "Card payments",
			external: true,
		});
		const support = d.node({ id: "support", kind: "context", title: "Support" });

		d.edge(catalog, ordering, {
			kind: "upstream-downstream",
			label: "Products",
			roles: { from: ["OHS", "PL"], to: ["CF"] },
		});
		d.edge(identity, ordering, {
			kind: "upstream-downstream",
			roles: { from: ["OHS"], to: ["ACL"] },
		});
		d.edge(ordering, billing, { kind: "customer-supplier", label: "Orders to invoice" });
		d.edge(ordering, shipping, { kind: "customer-supplier", roles: { from: ["PL"] } });
		d.edge(payments, billing, {
			kind: "upstream-downstream",
			roles: { from: ["OHS", "PL"], to: ["ACL"] },
		});
		d.edge(billing, shipping, { kind: "shared-kernel", label: "Addresses" });
		d.edge(ordering, support, { kind: "partnership" });
	});
}
