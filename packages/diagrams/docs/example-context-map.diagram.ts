import { domain } from "@the-platform/diagrams";

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
	const ordering = d.node({ id: "ordering", kind: "context", title: "Ordering" });
	const shipping = d.node({ id: "shipping", kind: "context", title: "Shipping" });

	d.edge(catalog, ordering, {
		kind: "upstream-downstream",
		label: "Products",
		roles: { from: ["OHS", "PL"], to: ["CF"] },
	});
	d.edge(cards, ordering, { kind: "upstream-downstream", roles: { to: ["ACL"] } });
	d.edge(ordering, shipping, { kind: "partnership" });
});
