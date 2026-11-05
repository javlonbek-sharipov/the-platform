import type { PlatformDiagram } from "@the-platform/diagrams/web-component";
import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { architecture } from "../../src/index.ts";
import { draw } from "./support/drawing.ts";
import { textOf } from "./support/looking.ts";
import { mount } from "./support/page.ts";

function shop() {
	return architecture({ id: "docs/shop", title: "Shop" }, (d) => {
		d.node({
			id: "orders",
			kind: "service",
			title: "Orders API",
			technology: "go",
			external: true,
			status: "degraded",
			rows: [{ name: "replicas", value: "3" }, { name: "order-placed" }],
			description: "Accepts <orders> and announces them.",
		});
	});
}

test("clicking a Node opens its complete details from the SVG without an Atlas index", async () => {
	const diagram = (await mount(draw(shop()).svg, "width: 900px; height: 400px")) as PlatformDiagram;

	await userEvent.click(textOf(diagram, "Orders API"));

	const details = page.elementLocator(diagram).getByRole("dialog", { name: "Orders API details" });
	await expect.element(details).toBeVisible();
	expect(details.element().textContent).toContain("Kindservice");
	expect(details.element().textContent).toContain("TechnologyGo");
	expect(details.element().textContent).toContain("ExternalYes");
	expect(details.element().textContent).toContain("Statusdegraded");
	expect(details.element().textContent).toContain("replicas3");
	expect(details.element().textContent).toContain("order-placed");
	expect(details.element().textContent).toContain("Accepts <orders> and announces them.");
	expect(diagram.selectedNode).toBe("orders");
	await details.getByRole("button", { name: "Close details" }).click();
	expect(details.query()).toBeNull();
});

test("Enter opens the selected Node and Escape closes details and clears ordinary selection", async () => {
	const diagram = (await mount(draw(shop()).svg, "width: 900px; height: 400px")) as PlatformDiagram;
	await userEvent.tab();
	const stage = diagram.shadowRoot?.activeElement;

	await userEvent.keyboard("{Enter}");

	const details = page.elementLocator(diagram).getByRole("dialog", { name: "Orders API details" });
	await expect.element(details).toBeVisible();
	expect(diagram.shadowRoot?.activeElement).toBe(details.element());
	await userEvent.keyboard("{Escape}");
	expect(details.query()).toBeNull();
	expect(diagram.shadowRoot?.activeElement).toBe(stage);
	expect(diagram.selection).toBeUndefined();
});

test("a Node's ordinary list button opens details with Enter and receives focus back", async () => {
	const diagram = await mount(draw(shop()).svg, "width: 900px; height: 400px");
	await userEvent.tab();
	await userEvent.tab();
	const item = page
		.elementLocator(diagram)
		.getByRole("list", { name: "Nodes" })
		.getByRole("button");
	expect(item.element().matches(":focus")).toBe(true);

	await userEvent.keyboard("{Enter}");

	await expect.element(page.elementLocator(diagram).getByRole("dialog")).toBeVisible();
	await userEvent.keyboard("{Escape}");
	expect(item.element().matches(":focus")).toBe(true);
});

test("a Group label and its accessible list button open the Group's own details", async () => {
	const model = architecture({ title: "Grouped shop" }, (d) => {
		d.group(
			{
				id: "store",
				kind: "system",
				title: "Store",
				description: "Owns the shop's checkout.",
			},
			(store) => {
				store.node({ id: "orders", kind: "service", title: "Orders API" });
			},
		);
	});
	const diagram = await mount(draw(model).svg, "width: 900px; height: 400px");
	await userEvent.click(textOf(diagram, "Store"));

	const details = page.elementLocator(diagram).getByRole("dialog", { name: "Store details" });
	await expect.element(details, { timeout: 500 }).toBeVisible();
	expect(details.element().textContent).toContain("Kindsystem");
	expect(details.element().textContent).toContain("Owns the shop's checkout.");
	await userEvent.keyboard("{Escape}");
	await userEvent.tab();
	await userEvent.tab();
	const item = page
		.elementLocator(diagram)
		.getByRole("list", { name: "Groups" })
		.getByRole("button");
	expect(item.element().matches(":focus")).toBe(true);
	await userEvent.keyboard("{Enter}");
	await expect.element(details).toBeVisible();
	await userEvent.keyboard("{Escape}");
	expect(item.element().matches(":focus")).toBe(true);
});

test("the wheel scrolls long details while their controls leave the drawing's camera alone", async () => {
	const model = architecture({ title: "Long details" }, (d) => {
		d.node({
			id: "orders",
			kind: "service",
			title: "Orders API",
			rows: Array.from({ length: 16 }, (_, index) => ({
				name: `Fact ${index}`,
				value: "Full detail",
			})),
		});
	});
	const diagram = await mount(draw(model).svg, "width: 700px; height: 320px");
	await userEvent.click(textOf(diagram, "Orders API"));
	const details = page.elementLocator(diagram).getByRole("dialog").element();
	const width = textOf(diagram, "Orders API").getBoundingClientRect().width;
	const { wheel } = await import("./support/input.ts");
	const { frame } = await import("./support/page.ts");

	await wheel(details, { x: 100, y: 100 }, 240);
	await frame();

	expect(details.scrollTop).toBeGreaterThan(0);
	expect(textOf(diagram, "Orders API").getBoundingClientRect().width).toBe(width);
});

test("details retain their own keys instead of zooming the drawing", async () => {
	const diagram = await mount(draw(shop()).svg, "width: 900px; height: 400px");
	await userEvent.click(textOf(diagram, "Orders API"));
	const width = textOf(diagram, "Orders API").getBoundingClientRect().width;

	await userEvent.keyboard("+");

	expect(textOf(diagram, "Orders API").getBoundingClientRect().width).toBe(width);
});

test("a reader can select and copy description text in details", async () => {
	const diagram = await mount(draw(shop()).svg, "width: 900px; height: 650px");
	await userEvent.click(textOf(diagram, "Orders API"));
	const description = page
		.elementLocator(diagram)
		.getByRole("dialog")
		.getByText("Accepts <orders> and announces them.")
		.element();
	const { drag } = await import("./support/input.ts");
	window.getSelection()?.removeAllRanges();

	await drag(description, { x: 1, y: 10 }, { x: 100, y: 10 });

	expect(String(window.getSelection())).toContain("Accepts");
	window.getSelection()?.removeAllRanges();
});

test("a redraw refreshes open details by id and removes them when their Node disappears", async () => {
	const diagram = (await mount(draw(shop()).svg, "width: 900px; height: 500px")) as PlatformDiagram;
	await userEvent.click(textOf(diagram, "Orders API"));
	const replacement = shop();
	if (replacement.nodes[0] !== undefined)
		replacement.nodes[0].description = "Now accepts revised orders.";
	const { frame } = await import("./support/page.ts");

	diagram.innerHTML = draw(replacement).svg;
	await frame();

	const details = page.elementLocator(diagram).getByRole("dialog", { name: "Orders API details" });
	expect(details.query()).not.toBeNull();
	expect(details.element().textContent).toContain("Now accepts revised orders.");
	expect(details.element().textContent).not.toContain("Accepts <orders>");
	expect(diagram.shadowRoot?.activeElement).toBe(details.element());
	diagram.innerHTML = draw(architecture({ id: "docs/shop", title: "Shop" }, () => {})).svg;
	await frame();
	expect(details.query()).toBeNull();
	expect(diagram.shadowRoot?.activeElement?.getAttribute("aria-label")).toBe("Shop");
});

test("closing details preserves an explicit highlight until the next Escape on the drawing", async () => {
	const model = architecture({ title: "Highlights" }, (d) => {
		d.node({ id: "orders", kind: "service", title: "Orders API" });
		d.node({ id: "aside", kind: "worker", title: "Aside" });
	});
	const diagram = (await mount(draw(model).svg, "width: 900px; height: 400px")) as PlatformDiagram;
	const { opacityOf } = await import("./support/looking.ts");
	diagram.setHighlight({ nodes: ["orders"] });
	await userEvent.tab();
	await userEvent.keyboard("{Enter}{Escape}");

	expect(page.elementLocator(diagram).getByRole("dialog").query()).toBeNull();
	expect(opacityOf(textOf(diagram, "Aside"))).toBeLessThan(0.5);
	await userEvent.keyboard("{Escape}");
	expect(opacityOf(textOf(diagram, "Aside"))).toBe(1);
});

test("details and Walkthroughs share Escape without releasing playback highlights or ordinary selection", async () => {
	const model = architecture({ id: "docs/playback", title: "Playback" }, (d) => {
		const orders = d.node({ id: "orders", kind: "service", title: "Orders API" });
		const db = d.node({ id: "db", kind: "database", title: "Orders DB" });
		d.node({ id: "aside", kind: "worker", title: "Aside" });
		const save = d.edge(orders, db, { kind: "call" });
		d.walkthrough({
			id: "inspect",
			title: "Inspect orders",
			steps: [{ edges: [save] }, { node: orders }],
		});
	});
	const diagram = (await mount(draw(model).svg, "width: 1000px; height: 600px")) as PlatformDiagram;
	diagram.motion = "off";
	diagram.selectNode("orders");
	diagram.setHighlight({ nodes: ["aside"] });
	const component = page.elementLocator(diagram);
	await component.getByRole("button", { name: "Inspect orders" }).click();
	const playback = component.getByRole("region", { name: "Walkthrough" });
	await playback.getByRole("button", { name: "Pause" }).click();
	await userEvent.click(textOf(diagram, "Orders API"));
	await userEvent.keyboard("{Escape}");

	expect(component.getByRole("dialog").query()).toBeNull();
	expect(diagram.selectedNode).toBe("orders");
	await expect.element(playback.getByRole("status")).toHaveTextContent("Step 1 of 2");
	const { opacityOf } = await import("./support/looking.ts");
	expect(opacityOf(textOf(diagram, "Aside"))).toBe(0.2);
	expect(opacityOf(textOf(diagram, "Orders DB"))).toBe(1);
	await userEvent.keyboard("{ArrowRight}");
	await expect.element(playback.getByRole("status")).toHaveTextContent("Step 2 of 2");
	expect(diagram.selectedNode).toBe("orders");
	await userEvent.keyboard("{Escape}");
	expect(playback.query()).toBeNull();
	expect(diagram.selectedNode).toBe("orders");
	expect(opacityOf(textOf(diagram, "Aside"))).toBe(1);
	expect(opacityOf(textOf(diagram, "Orders DB"))).toBe(0.2);
});
