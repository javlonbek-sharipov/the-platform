import type { DiagramNavigationEvent, PlatformDiagram } from "@the-platform/diagrams/web-component";
import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { type AtlasIndex, domain } from "../../src/index.ts";
import { draw } from "./support/drawing.ts";
import { moveTo } from "./support/input.ts";
import { textOf } from "./support/looking.ts";
import { mount } from "./support/page.ts";

function glossaryIndex(): AtlasIndex {
	return {
		diagrams: [],
		ids: {},
		terms: [
			{
				context: "billing",
				term: "Invoice",
				definition: "A **request** to pay <money>.",
				avoid: [],
				anchor: "invoice",
				glossary: "billing/GLOSSARY.md",
				line: 4,
			},
			{
				context: "ordering",
				term: "Invoice",
				definition: "Ordering's invoice meaning.",
				avoid: [],
				anchor: "invoice",
				glossary: "ordering/GLOSSARY.md",
				line: 4,
			},
			{
				context: "ordering",
				term: "Order placed",
				definition: "An order has been accepted.\nIt can be billed.",
				avoid: [],
				anchor: "order-placed",
				glossary: "ordering/GLOSSARY.md",
				line: 8,
			},
		],
	};
}

function billing() {
	return domain({ id: "docs/billing", title: "Billing" }, (d) => {
		d.node({
			id: "ordering/order-placed",
			kind: "event",
			title: "Order placed",
			links: [{ term: "Order placed" }],
		});
		d.group({ id: "billing", kind: "context", title: "Billing" }, (billing) => {
			billing.node({
				id: "invoice",
				kind: "aggregate",
				title: "Invoice",
				links: [{ term: "  INVOICE  " }, { term: "Missing" }],
			});
			billing.node({
				id: "imported",
				kind: "aggregate",
				title: "Imported",
				links: [{ term: "Invoice", context: "ordering" }],
			});
		});
	});
}

test("term hover uses the owning context, borrowed event context and explicit Link context", async () => {
	const diagram = (await mount(
		draw(billing()).svg,
		"width: 1100px; height: 550px",
	)) as PlatformDiagram;
	diagram.atlasIndex = glossaryIndex();
	const tooltip = page.elementLocator(diagram).getByRole("tooltip");
	for (const [title, definition] of [
		["Invoice", "A **request** to pay <money>."],
		["Order placed", "An order has been accepted.\nIt can be billed."],
		["Imported", "Ordering's invoice meaning."],
	] as const) {
		const node = textOf(diagram, title);
		await userEvent.hover(node);
		expect(tooltip.query()).not.toBeNull();
		expect(tooltip.element().textContent).toContain(definition);
		expect(tooltip.element().textContent).not.toContain("Missing");
		await moveTo(diagram, { x: 4, y: 4 });
		expect(tooltip.query()).toBeNull();
	}
});

test("a context-map Node's implicit term context is its own namespace", async () => {
	const model = domain({ title: "Context map" }, (d) => {
		d.node({ id: "billing", kind: "context", title: "Billing", links: [{ term: "Invoice" }] });
	});
	const diagram = (await mount(draw(model).svg, "width: 900px; height: 400px")) as PlatformDiagram;
	diagram.atlasIndex = glossaryIndex();
	await userEvent.hover(textOf(diagram, "Billing"));
	const tooltip = page.elementLocator(diagram).getByRole("tooltip");
	expect(tooltip.query()).not.toBeNull();
	expect(tooltip.element().textContent).toContain("A **request** to pay <money>.");
});

test.for(["node", "group"] as const)(
	"%s term details expose the definition and report an implicit context explicitly",
	async (kind) => {
		const model = domain({ id: "docs/billing", title: "Billing" }, (d) => {
			const subject = {
				id: "billing",
				kind: "context",
				title: "Billing",
				links: [{ term: "Invoice" }],
			} as const;
			if (kind === "node") d.node(subject);
			else
				d.group(subject, (billing) => {
					billing.node({ id: "invoice", kind: "aggregate", title: "Invoice" });
				});
		});
		const diagram = (await mount(
			draw(model).svg,
			"width: 900px; height: 450px",
		)) as PlatformDiagram;
		diagram.atlasIndex = glossaryIndex();
		diagram.resolveUrl = (target) =>
			typeof target !== "string" && target.term !== undefined
				? `/terms/${target.context}#invoice`
				: undefined;
		const heard: DiagramNavigationEvent[] = [];
		diagram.addEventListener("diagram-navigate", (event) =>
			heard.push(event as DiagramNavigationEvent),
		);
		await userEvent.click(textOf(diagram, "Billing"));
		const details = page.elementLocator(diagram).getByRole("dialog");
		expect(details.element().textContent).toContain("A **request** to pay <money>.");
		await details.getByRole("button", { name: "Invoice" }).click();
		expect(heard.at(-1)?.detail).toEqual({
			target: { term: "Invoice", context: "billing" },
			source: { diagram: "docs/billing", kind, id: "billing" },
			url: "/terms/billing#invoice",
		});
	},
);
