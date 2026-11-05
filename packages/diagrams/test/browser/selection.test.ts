import type { DiagramSelectionEvent, PlatformDiagram } from "@the-platform/diagrams/web-component";
import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { architecture, type Direction } from "../../src/index.ts";
import { draw } from "./support/drawing.ts";
import { opacityOf, textOf, textsOf } from "./support/looking.ts";
import { frame, mount } from "./support/page.ts";

function line(direction: Direction = "right") {
	return architecture({ title: "Selection", direction }, (d) => {
		const a = d.node({ id: "a", kind: "service", title: "First" });
		const b = d.node({ id: "b", kind: "service", title: "Second" });
		const c = d.node({ id: "c", kind: "service", title: "Third" });
		d.node({ id: "aside", kind: "worker", title: "Aside" });
		d.edge(a, b, { kind: "call" });
		d.edge(b, c, { kind: "call" });
	});
}

test("a host selects by id without taking focus or repeating a selection event", async () => {
	const diagram = (await mount(
		draw(line()).svg,
		"width: 1000px; height: 400px",
	)) as PlatformDiagram;
	const heard: unknown[] = [];
	diagram.addEventListener("diagram-select", (event) =>
		heard.push((event as DiagramSelectionEvent).detail),
	);
	const active = document.activeElement;

	expect(diagram.selectNode("b")).toBe(true);
	expect(diagram.selectNode("b")).toBe(true);
	expect(diagram.selectNode("missing")).toBe(false);

	expect(diagram.selectedNode).toBe("b");
	expect(document.activeElement).toBe(active);
	expect(heard).toEqual([{ kind: "node", id: "b" }]);
	await userEvent.hover(textOf(diagram, "Aside"));
	expect(diagram.selectedNode).toBe("b");
	expect(opacityOf(textOf(diagram, "Second"))).toBeLessThan(0.5);
	await userEvent.unhover(textOf(diagram, "Aside"));
	expect(opacityOf(textOf(diagram, "Second"))).toBe(1);
});

test("replacing the SVG keeps selection and stage focus, and uses only the new layout", async () => {
	const diagram = (await mount(
		draw(line()).svg,
		"width: 1000px; height: 600px",
	)) as PlatformDiagram;
	await userEvent.tab();
	await userEvent.keyboard("{ArrowRight}");
	expect(diagram.selectedNode).toBe("b");
	const active = diagram.shadowRoot?.activeElement;

	diagram.innerHTML = draw(line("down")).svg;
	await frame();

	expect(diagram.shadowRoot?.activeElement).toBe(active);
	expect(diagram.selectedNode).toBe("b");
	expect(page.elementLocator(diagram).getByRole("list").elements()).toHaveLength(2);
	await userEvent.keyboard("{ArrowDown}");
	expect(diagram.selectedNode).toBe("c");
	await userEvent.keyboard("{Escape}");
	expect(opacityOf(textOf(diagram, "Aside"))).toBe(1);
});

test("a replacement without the selected Node clears selection and removes old list entries", async () => {
	const diagram = (await mount(
		draw(line()).svg,
		"width: 1000px; height: 400px",
	)) as PlatformDiagram;
	diagram.selectNode("b");
	const heard: unknown[] = [];
	diagram.addEventListener("diagram-select", (event) =>
		heard.push((event as DiagramSelectionEvent).detail),
	);

	diagram.innerHTML = draw(
		architecture({ title: "Next Diagram" }, (d) => {
			d.node({ id: "replacement", kind: "service", title: "Replacement" });
		}),
	).svg;
	await frame();

	expect(diagram.selection).toBeUndefined();
	expect(heard).toEqual([null]);
	expect(textsOf(diagram, "Second")).toEqual([]);
	expect(
		page
			.elementLocator(diagram)
			.getByRole("list", { name: "Nodes" })
			.getByRole("listitem")
			.elements()
			.map((item) => item.textContent),
	).toEqual(["Replacement (service)."]);
	expect(opacityOf(textOf(diagram, "Replacement"))).toBe(1);
});

test("a list item keeps keyboard focus by id when the SVG is replaced", async () => {
	const diagram = (await mount(
		draw(line()).svg,
		"width: 1000px; height: 600px",
	)) as PlatformDiagram;
	for (let tab = 0; tab < 4; tab += 1) {
		await userEvent.tab();
	}
	expect(diagram.selectedNode).toBe("b");

	diagram.innerHTML = draw(line("down")).svg;
	await frame();

	const button = page
		.elementLocator(diagram)
		.getByRole("list", { name: "Nodes" })
		.getByRole("button", { name: "Second (service)." })
		.element();
	expect(button.matches(":focus")).toBe(true);
	expect(diagram.selectedNode).toBe("b");
});
