import type { DiagramNavigationEvent, PlatformDiagram } from "@the-platform/diagrams/web-component";
import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { architecture, type Link } from "../../src/index.ts";
import { draw } from "./support/drawing.ts";
import { textOf } from "./support/looking.ts";
import { mount } from "./support/page.ts";

const links: Link[] = [
	{ id: "payments", label: "Payment service" },
	{ doc: "docs/specs/orders.md", section: "Accept an order", label: "Order spec" },
	{ term: "Order", context: "ordering", label: "Order definition" },
];

test.for(["node", "group"] as const)(
	"each Link in %s details reports its target to the host without an index",
	async (kind) => {
		const model = architecture({ id: "docs/shop", title: "Shop" }, (d) => {
			const subject = { id: "store", kind: "system", title: "Store", links } as const;
			if (kind === "node") d.node(subject);
			else d.group(subject, () => {});
		});

		const diagram = await mount(draw(model).svg, "width: 900px; height: 450px");
		const heard: DiagramNavigationEvent[] = [];
		const hear = (event: Event) => {
			if (event.target === diagram) heard.push(event as DiagramNavigationEvent);
		};
		document.body.addEventListener("diagram-navigate", hear);
		try {
			await userEvent.click(textOf(diagram, "Store"));
			const details = page.elementLocator(diagram).getByRole("dialog", { name: "Store details" });
			const list = details.getByRole("list", { name: "Links" });
			expect(list.query()).not.toBeNull();
			for (const link of links) await list.getByRole("button", { name: link.label }).click();

			expect(heard.map(({ detail }) => detail)).toEqual(
				links.map((target) => ({
					target,
					source: { diagram: "docs/shop", kind, id: "store" },
				})),
			);
			expect(heard.every((event) => event.bubbles && event.composed)).toBe(true);
		} finally {
			document.body.removeEventListener("diagram-navigate", hear);
		}
	},
);

test("the host's current URL resolver supplies navigation URLs for all three Link kinds", async () => {
	const model = architecture({ id: "docs/shop", title: "Shop" }, (d) => {
		d.node({ id: "store", kind: "system", title: "Store", links });
	});
	const diagram = (await mount(draw(model).svg, "width: 900px; height: 450px")) as PlatformDiagram;
	diagram.resolveUrl = (target) => {
		if (typeof target === "string") return `/diagrams/${target}`;
		if (target.id !== undefined) return `/ids/${target.id}`;
		if (target.term !== undefined)
			return `/glossary/${target.context}#${target.term.toLowerCase()}`;
		return `/pages/${target.doc}#accept-an-order`;
	};
	const heard: DiagramNavigationEvent[] = [];
	diagram.addEventListener("diagram-navigate", (event) =>
		heard.push(event as DiagramNavigationEvent),
	);
	await userEvent.click(textOf(diagram, "Store"));
	const list = page
		.elementLocator(diagram)
		.getByRole("dialog")
		.getByRole("list", { name: "Links" });
	for (const link of links) await list.getByRole("button", { name: link.label }).click();

	expect(heard.map(({ detail }) => detail.url)).toEqual([
		"/ids/payments",
		"/pages/docs/specs/orders.md#accept-an-order",
		"/glossary/ordering#order",
	]);
	diagram.resolveUrl = () => "/changed";
	await list.getByRole("button", { name: "Order spec" }).click();
	expect(heard.at(-1)?.detail.url).toBe("/changed");
	diagram.resolveUrl = undefined;
	await list.getByRole("button", { name: "Order spec" }).click();
	expect(heard.at(-1)?.detail.url).toBeUndefined();
});

function shopIndex(): import("../../src/index.ts").AtlasIndex {
	return {
		diagrams: [
			{
				id: "docs/shop",
				title: "Shop overview",
				notation: "architecture",
				svg: "docs/shop.diagram.svg",
			},
			{
				id: "docs/store",
				title: "Store internals",
				notation: "architecture",
				svg: "docs/store.diagram.svg",
			},
			{
				id: "docs/ops",
				title: "Operations",
				notation: "architecture",
				svg: "docs/ops.diagram.svg",
			},
		],
		ids: {
			store: {
				kind: "system",
				title: "Store",
				asNode: ["docs/shop", "docs/ops"],
				asGroup: ["docs/store"],
			},
		},
		terms: [],
	};
}

test.for(["node", "group"] as const)(
	"%s details list other Diagrams and Node drill-down uses the host resolver",
	async (kind) => {
		const model = architecture(
			{ id: kind === "node" ? "docs/shop" : "docs/store", title: "Shop" },
			(d) => {
				const subject = { id: "store", kind: "system", title: "Store" } as const;
				if (kind === "node") d.node(subject);
				else d.group(subject, () => {});
			},
		);
		const diagram = (await mount(
			draw(model).svg,
			"width: 900px; height: 450px",
		)) as PlatformDiagram;
		diagram.atlasIndex = shopIndex();
		diagram.resolveUrl = (target) =>
			typeof target === "string" ? `/diagram/${target}` : undefined;
		const heard: DiagramNavigationEvent[] = [];
		diagram.addEventListener("diagram-navigate", (event) =>
			heard.push(event as DiagramNavigationEvent),
		);
		await userEvent.click(textOf(diagram, "Store"));
		const details = page.elementLocator(diagram).getByRole("dialog");
		const others = details.getByRole("list", { name: "Other Diagrams" });
		expect(others.query()).not.toBeNull();
		expect(
			others
				.getByRole("button")
				.elements()
				.map((button) => button.textContent),
		).toEqual(
			kind === "node" ? ["Store internals", "Operations"] : ["Shop overview", "Operations"],
		);
		await others.getByRole("button", { name: "Operations" }).click();
		expect(heard.at(-1)?.detail).toEqual({
			target: "docs/ops",
			url: "/diagram/docs/ops",
			source: { diagram: model.id, kind, id: "store" },
		});
		const drill = details.getByRole("list", { name: "Drill down" });
		if (kind === "node") {
			await drill.getByRole("button", { name: "Store internals" }).click();
			expect(heard.at(-1)?.detail).toEqual({
				target: "docs/store",
				url: "/diagram/docs/store",
				source: { diagram: "docs/shop", kind: "node", id: "store" },
			});
		} else expect(drill.query()).toBeNull();
	},
);

test("assigning or removing the host Atlas index refreshes open details without taking focus", async () => {
	const model = architecture({ id: "docs/shop", title: "Shop" }, (d) => {
		d.node({ id: "store", kind: "system", title: "Store" });
	});
	const diagram = (await mount(draw(model).svg, "width: 900px; height: 450px")) as PlatformDiagram;
	await userEvent.click(textOf(diagram, "Store"));
	await userEvent.tab();
	const active = diagram.shadowRoot?.activeElement;
	const others = page
		.elementLocator(diagram)
		.getByRole("dialog")
		.getByRole("list", { name: "Other Diagrams" });
	expect(others.query()).toBeNull();

	diagram.atlasIndex = shopIndex();

	expect(others.getByRole("button").elements()).toHaveLength(2);
	expect(diagram.shadowRoot?.activeElement).toBe(active);
	diagram.atlasIndex = undefined;
	expect(others.query()).toBeNull();
	expect(diagram.shadowRoot?.activeElement).toBe(active);
});

test("a borrowed event offers its own context's Diagram rather than another borrower's", async () => {
	const { domain } = await import("../../src/index.ts");
	const model = domain({ id: "docs/billing", title: "Billing" }, (d) => {
		d.node({ id: "ordering/order-placed", kind: "event", title: "Order placed" });
		d.group({ id: "billing", kind: "context", title: "Billing" }, (billing) => {
			billing.node({ id: "invoice", kind: "aggregate", title: "Invoice" });
		});
	});
	const diagram = (await mount(draw(model).svg, "width: 1100px; height: 450px")) as PlatformDiagram;
	diagram.atlasIndex = {
		diagrams: [
			{ id: "docs/billing", title: "Billing", notation: "domain", svg: "docs/billing.diagram.svg" },
			{
				id: "docs/ordering",
				title: "Ordering aggregates",
				notation: "domain",
				svg: "docs/ordering.diagram.svg",
			},
			{
				id: "docs/shipping",
				title: "Shipping",
				notation: "domain",
				svg: "docs/shipping.diagram.svg",
			},
			{
				id: "docs/empty",
				title: "Empty Ordering",
				notation: "domain",
				svg: "docs/empty.diagram.svg",
			},
		],
		ids: {
			ordering: {
				kind: "context",
				title: "Ordering",
				context: "ordering",
				asNode: [],
				asGroup: ["docs/ordering", "docs/empty"],
			},
			"ordering/order-placed": {
				kind: "event",
				title: "Order placed",
				context: "ordering",
				asNode: ["docs/billing", "docs/ordering", "docs/shipping"],
				asGroup: [],
			},
		},
		terms: [],
	};
	const heard: DiagramNavigationEvent[] = [];
	diagram.addEventListener("diagram-navigate", (event) =>
		heard.push(event as DiagramNavigationEvent),
	);
	await userEvent.click(textOf(diagram, "Order placed"));
	const drill = page
		.elementLocator(diagram)
		.getByRole("dialog")
		.getByRole("list", { name: "Drill down" });
	expect(drill.query()).not.toBeNull();
	expect(
		drill
			.getByRole("button")
			.elements()
			.map((button) => button.textContent),
	).toEqual(["Ordering aggregates"]);
	await drill.getByRole("button", { name: "Ordering aggregates" }).click();
	expect(heard.at(-1)?.detail).toEqual({
		target: "docs/ordering",
		source: { diagram: "docs/billing", kind: "node", id: "ordering/order-placed" },
	});
});
