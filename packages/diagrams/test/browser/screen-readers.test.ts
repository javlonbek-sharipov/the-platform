import type { PlatformDiagram } from "@the-platform/diagrams/web-component";
import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { architecture, type Diagram, type Direction, domain } from "../../src/index.ts";
import { draw } from "./support/drawing.ts";
import { opacityOf, textOf } from "./support/looking.ts";
import { mount } from "./support/page.ts";

declare global {
	interface Window {
		/** Chromium's find-in-page, which the DOM type library doesn't declare. */
		find(text: string, caseSensitive: boolean, backwards: boolean, wrap: boolean): boolean;
	}
}

/** Declaration and Edge order differ from layout order. */
function shop(direction: Direction = "right"): Diagram {
	return architecture({ title: "Accessible shop", direction }, (d) => {
		const db = d.node({
			id: "db",
			kind: "database",
			title: "Orders DB",
			technology: "postgres",
			rows: [{ name: "region", value: "EU" }],
		});
		const api = d.node({
			id: "api",
			kind: "service",
			title: "Orders API",
			technology: "go",
			rows: [{ name: "replicas", value: "3" }, { name: "order-placed" }],
		});
		const web = d.node({ id: "web", kind: "client", title: "Web app", technology: "typescript" });
		d.node({ id: "audit", kind: "worker", title: "Audit", technology: "audit-engine" });
		d.edge(api.row("order-placed"), db, {
			kind: "call",
			technology: "postgres",
			rate: "30/s",
			label: "Saves orders",
		});
		d.edge(web, api, { kind: "call", label: "Places orders" });
	});
}

test.for(["right", "down"] as const)(
	"the Nodes list gives full facts and Rows in layout order, drawn %s",
	async (direction) => {
		const diagram = await mount(draw(shop(direction)).svg, "width: 1000px; height: 600px");

		const list = page.elementLocator(diagram).getByRole("list", { name: "Nodes" });
		expect(
			list
				.getByRole("listitem")
				.elements()
				.map((item) => item.textContent),
		).toEqual([
			"Web app (client, TypeScript).",
			"Audit (worker, audit-engine).",
			"Orders API (service, Go). Rows: replicas: 3; order-placed.",
			"Orders DB (database, PostgreSQL). Rows: region: EU.",
		]);
	},
);

test.for(["right", "down"] as const)(
	"the Edges list follows its Nodes' layout order and uses the SVG's sentences, drawn %s",
	async (direction) => {
		const diagram = await mount(draw(shop(direction)).svg, "width: 1000px; height: 600px");
		const sentences = page
			.elementLocator(diagram)
			.getByRole("list", { name: "Edges" })
			.getByRole("listitem")
			.elements()
			.map((item) => item.textContent);

		expect(sentences).toEqual([
			"Web app calls Orders API: Places orders.",
			"Orders API (order-placed) calls Orders DB over PostgreSQL at 30/s: Saves orders.",
		]);
		const description = diagram.shadowRoot?.querySelector("svg > desc")?.textContent ?? "";
		for (const sentence of sentences) {
			expect(description).toContain(sentence);
		}
	},
);

test("focusing a Node in the list selects it in the drawing", async () => {
	const diagram = (await mount(
		draw(shop()).svg,
		"width: 1000px; height: 400px",
	)) as PlatformDiagram;
	const list = page.elementLocator(diagram).getByRole("list", { name: "Nodes" });

	await userEvent.tab();
	await userEvent.tab();
	await userEvent.tab();

	expect(
		list.getByRole("button", { name: "Audit (worker, audit-engine)." }).element().matches(":focus"),
	).toBe(true);
	expect(diagram.selectedNode).toBe("audit");
	expect(
		list
			.getByRole("button", { name: "Audit (worker, audit-engine)." })
			.element()
			.getAttribute("aria-current"),
	).toBe("true");
	await expect.poll(() => opacityOf(textOf(diagram, "Audit"))).toBe(1);
	await expect.poll(() => opacityOf(textOf(diagram, "Orders API"))).toBeLessThan(0.5);
});

test("focusing an Edge in the list selects only that Edge and its ends", async () => {
	const diagram = (await mount(
		draw(shop()).svg,
		"width: 1000px; height: 400px",
	)) as PlatformDiagram;
	for (let tab = 0; tab < 6; tab += 1) {
		await userEvent.tab();
	}

	const item = page
		.elementLocator(diagram)
		.getByRole("list", { name: "Edges" })
		.getByRole("button", { name: "Web app calls Orders API: Places orders." })
		.element();
	expect(item.matches(":focus")).toBe(true);
	expect(item.getAttribute("aria-current")).toBe("true");
	expect(diagram.selection).toEqual({ kind: "edge", id: "web->api" });
	await expect.poll(() => opacityOf(textOf(diagram, "Places orders"))).toBe(1);
	await expect.poll(() => opacityOf(textOf(diagram, "Saves orders"))).toBeLessThan(0.5);
	await expect.poll(() => opacityOf(textOf(diagram, "Orders DB"))).toBeLessThan(0.5);
});

test("find-in-page selects a Node's whole title even when the SVG shortened it", async () => {
	const title = "The complete warehouse inventory reconciliation";
	const drawing = draw(
		architecture({ title: "Warehouse" }, (d) => {
			d.node({ id: "inventory", kind: "service", title });
		}),
	);
	expect(drawing.scene.nodes[0]?.title.shortened).toBe(true);
	await mount(drawing.svg, "width: 700px; height: 300px");
	window.getSelection()?.removeAllRanges();

	expect(window.find(title, true, false, true)).toBe(true);
	expect(String(window.getSelection())).toBe(title);
	window.getSelection()?.removeAllRanges();
});

test("role names and symmetric Edge sentences match the SVG description", async () => {
	const model = domain({ title: "Contexts" }, (d) => {
		const shipping = d.node({ id: "shipping", kind: "context", title: "Shipping" });
		const ordering = d.node({ id: "ordering", kind: "context", title: "Ordering" });
		const catalog = d.node({ id: "catalog", kind: "context", title: "Catalog" });
		d.edge(catalog, ordering, {
			kind: "upstream-downstream",
			label: "Products",
			roles: { from: ["OHS", "PL"], to: ["ACL"] },
		});
		d.edge(shipping, ordering, { kind: "partnership", label: "Deliveries" });
	});
	const diagram = await mount(draw(model).svg, "width: 1000px; height: 400px");
	const sentences = page
		.elementLocator(diagram)
		.getByRole("list", { name: "Edges" })
		.getByRole("listitem")
		.elements()
		.map((item) => item.textContent);

	expect(sentences).toEqual([
		"Shipping and Ordering are partners: Deliveries.",
		"Catalog (open host service, published language) is upstream of Ordering (anticorruption layer): Products.",
	]);
	const description = diagram.shadowRoot?.querySelector("svg > desc")?.textContent ?? "";
	for (const sentence of sentences) {
		expect(description).toContain(sentence);
	}
});

test("keyboard selection is announced without repeating the SVG's image description", async () => {
	const diagram = await mount(draw(shop()).svg, "width: 1000px; height: 400px");

	await userEvent.tab();
	await userEvent.keyboard("{ArrowRight}");

	const component = page.elementLocator(diagram);
	expect(component.getByRole("status").element().textContent).toBe(
		"Orders API (service, Go). Rows: replicas: 3; order-placed.",
	);
	expect(component.getByRole("img", { name: "Accessible shop" }).elements()).toEqual([]);
});
