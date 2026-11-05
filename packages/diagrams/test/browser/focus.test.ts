import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { architecture, type Diagram, domain } from "../../src/index.ts";
import { draw } from "./support/drawing.ts";
import { opacityOf, textOf } from "./support/looking.ts";
import { mount } from "./support/page.ts";

/** A cycle, a branch off an ancestor, and another caller of a descendant. */
function dependencies(): Diagram {
	return architecture({ title: "Dependencies" }, (d) => {
		const source = d.node({ id: "source", kind: "client", title: "Source" });
		const focus = d.node({ id: "focus", kind: "service", title: "Focus" });
		const downstream = d.node({ id: "downstream", kind: "worker", title: "Downstream" });
		const leaf = d.node({ id: "leaf", kind: "database", title: "Leaf" });
		const sibling = d.node({ id: "sibling", kind: "function", title: "Sibling" });
		const other = d.node({ id: "other", kind: "gateway", title: "Other caller" });
		d.node({ id: "isolated", kind: "cache", title: "Isolated" });
		d.edge(source, focus, { kind: "call", label: "Starts" });
		d.edge(focus, downstream, { kind: "message", label: "Work" });
		d.edge(downstream, leaf, { kind: "call", label: "Stores" });
		d.edge(leaf, downstream, { kind: "call", label: "Returns" });
		d.edge(source, sibling, { kind: "call", label: "Sibling work" });
		d.edge(other, downstream, { kind: "call", label: "Other work" });
	});
}

test("hover keeps only a Node's ancestors and descendants at full strength", async () => {
	const diagram = await mount(draw(dependencies()).svg, "width: 1200px; height: 500px");

	await userEvent.hover(textOf(diagram, "Focus"));

	expect(
		["Source", "Focus", "Downstream", "Leaf"].map((title) => opacityOf(textOf(diagram, title))),
	).toEqual([1, 1, 1, 1]);
	for (const title of ["Sibling", "Other caller", "Isolated"]) {
		expect(opacityOf(textOf(diagram, title)), title).toBeLessThan(0.5);
	}
});

test.for(["partnership", "shared-kernel"] as const)(
	"%s Edges count in both directions, with labels and role tags following focus",
	async (kind) => {
		const model = domain({ title: "Contexts" }, (d) => {
			const catalog = d.node({ id: "catalog", kind: "context", title: "Catalog" });
			const ordering = d.node({ id: "ordering", kind: "context", title: "Ordering" });
			const shipping = d.node({ id: "shipping", kind: "context", title: "Shipping" });
			const billing = d.node({ id: "billing", kind: "context", title: "Billing" });
			const archive = d.node({ id: "archive", kind: "context", title: "Archive" });
			d.edge(catalog, ordering, {
				kind: "upstream-downstream",
				label: "Products",
				roles: { from: ["OHS", "PL"], to: ["ACL"] },
			});
			d.edge(shipping, ordering, { kind, label: "Deliveries" });
			d.edge(shipping, billing, { kind: "customer-supplier", label: "Charges" });
			d.edge(catalog, archive, {
				kind: "upstream-downstream",
				label: "Old products",
				roles: { from: ["OHS"], to: ["CF"] },
			});
		});
		const diagram = await mount(draw(model).svg, "width: 1200px; height: 500px");

		for (const title of ["Ordering", "Shipping"]) {
			await userEvent.hover(textOf(diagram, title));

			expect(
				["Catalog", "Ordering", "Shipping", "Billing"].map((name) =>
					opacityOf(textOf(diagram, name)),
				),
			).toEqual([1, 1, 1, 1]);
			expect(opacityOf(textOf(diagram, "Archive"))).toBeLessThan(0.5);
			for (const edge of model.edges) {
				const kept = edge.id !== "catalog->archive";
				const parts =
					diagram.shadowRoot?.querySelectorAll(
						`[data-edge="${edge.id}"], [data-edge-label="${edge.id}"], [data-edge-role="${edge.id}"]`,
					) ?? [];
				for (const part of parts) {
					expect(opacityOf(part) === 1, `${title}: ${edge.id}`).toBe(kept);
				}
			}
		}
	},
);

test("an Edge's label follows its path's focus", async () => {
	const diagram = await mount(draw(dependencies()).svg, "width: 1200px; height: 500px");

	await userEvent.hover(textOf(diagram, "Focus"));

	for (const [id, label, kept] of [
		["source->focus", "Starts", true],
		["focus->downstream", "Work", true],
		["downstream->leaf", "Stores", true],
		["leaf->downstream", "Returns", true],
		["source->sibling", "Sibling work", false],
		["other->downstream", "Other work", false],
	] as const) {
		const edge = diagram.shadowRoot?.querySelector(`[data-edge="${id}"]`) as Element;
		expect(opacityOf(edge) === 1, id).toBe(kept);
		expect(opacityOf(textOf(diagram, label))).toBe(opacityOf(edge));
	}
});

test("leaving a hovered Node and pressing Escape each clear focus", async () => {
	const diagram = await mount(draw(dependencies()).svg, "width: 1200px; height: 500px");
	const focus = textOf(diagram, "Focus");
	const isolated = textOf(diagram, "Isolated");
	await userEvent.hover(focus);
	expect(opacityOf(isolated)).toBeLessThan(0.5);

	await userEvent.unhover(focus);
	expect(opacityOf(isolated)).toBe(1);

	await userEvent.click(focus);
	await userEvent.keyboard("{Escape}");

	expect(opacityOf(isolated)).toBe(1);
	expect(opacityOf(textOf(diagram, "Sibling work"))).toBe(1);
});
