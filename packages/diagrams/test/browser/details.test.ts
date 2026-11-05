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

test("Enter opens the selected Node and Escape closes details before clearing selection", async () => {
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
	expect(diagram.selectedNode).toBe("orders");
	await userEvent.keyboard("{Escape}");
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
