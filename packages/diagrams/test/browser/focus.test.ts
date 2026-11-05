import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { architecture, type Diagram, domain } from "../../src/index.ts";
import { draw } from "./support/drawing.ts";
import { moveTo } from "./support/input.ts";
import { opacityOf, textOf, viewOf } from "./support/looking.ts";
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

test("clicking selects a Node until Escape, and reports the selection to the page", async () => {
	const diagram = await mount(draw(dependencies()).svg, "width: 1200px; height: 500px");
	const heard: unknown[] = [];
	diagram.parentElement?.addEventListener("diagram-select", (event) => {
		heard.push({ detail: (event as CustomEvent).detail, composed: event.composed });
	});
	const focus = textOf(diagram, "Focus");

	await userEvent.click(focus);
	await userEvent.unhover(focus);

	expect(heard).toEqual([{ detail: { kind: "node", id: "focus" }, composed: true }]);
	expect(opacityOf(textOf(diagram, "Isolated"))).toBeLessThan(0.5);

	await userEvent.keyboard("{Escape}");

	expect(opacityOf(textOf(diagram, "Isolated"))).toBe(1);
	expect(heard.at(-1)).toEqual({ detail: null, composed: true });
});

test("hovering an Edge reveals its whole label, Technology and rate", async () => {
	const label = "Authorizes every payment for the complete customer order";
	const model = architecture({ title: "Payments" }, (d) => {
		const checkout = d.node({ id: "checkout", kind: "service", title: "Checkout" });
		const payments = d.node({ id: "payments", kind: "service", title: "Payments" });
		d.node({ id: "unrelated", kind: "worker", title: "Unrelated" });
		d.edge(checkout, payments, { kind: "call", label, technology: "grpc", rate: "2k/s" });
	});
	const drawing = draw(model);
	const shortened = drawing.scene.edges[0]?.label?.text;
	expect(shortened?.shortened).toBe(true);
	const diagram = await mount(drawing.svg, "width: 900px; height: 400px");

	await userEvent.hover(textOf(diagram, shortened?.text ?? ""));

	const tooltip = page.elementLocator(diagram).getByRole("tooltip").element();
	expect(tooltip.textContent).toContain(label);
	expect(tooltip.textContent).toContain("grpc");
	expect(tooltip.textContent).toContain("2k/s");
	expect(opacityOf(textOf(diagram, "Unrelated"))).toBeLessThan(0.5);

	await userEvent.unhover(tooltip);
	expect(page.elementLocator(diagram).getByRole("tooltip").elements()).toEqual([]);
});

test("an Edge's line is easy to hover, and names a known Technology in full", async () => {
	const drawing = draw(
		architecture({ title: "Storage" }, (d) => {
			const api = d.node({ id: "api", kind: "service", title: "API" });
			const db = d.node({ id: "db", kind: "database", title: "Database" });
			d.edge(api, db, { kind: "call", technology: "postgres" });
		}),
	);
	const diagram = await mount(drawing.svg, "width: 900px; height: 400px");
	const route = drawing.scene.edges[0]?.route ?? [];
	const runs = route.slice(1).map((to, index) => [route[index] ?? to, to] as const);
	const [from, to] =
		runs.sort(
			([a, b], [c, d]) =>
				Math.abs(d.x - c.x) + Math.abs(d.y - c.y) - (Math.abs(b.x - a.x) + Math.abs(b.y - a.y)),
		)[0] ?? [];
	if (from === undefined || to === undefined) {
		throw new Error("the Edge has no run");
	}
	const at = viewOf(diagram, drawing.scene).point({
		x: (from.x + to.x) / 2,
		y: (from.y + to.y) / 2,
	});
	const box = diagram.getBoundingClientRect();

	// Four screen pixels from the line: within its hit area, beyond its visible stroke.
	await moveTo(diagram, { x: at.x - box.left, y: at.y - box.top + 4 });

	expect(page.elementLocator(diagram).getByRole("tooltip").element().textContent).toBe(
		"PostgreSQL",
	);
});
