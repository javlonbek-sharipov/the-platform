import type { PlatformDiagram } from "@the-platform/diagrams/web-component";
import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { architecture, type Diagram, type Direction } from "../../src/index.ts";
import { draw } from "./support/drawing.ts";
import { gapsOf, textOf } from "./support/looking.ts";
import { mount } from "./support/page.ts";

function navigation(direction: Direction = "right"): Diagram {
	return architecture({ title: "Navigation", direction }, (d) => {
		const start = d.node({ id: "start", kind: "service", title: "Start" });
		const top = d.node({ id: "top", kind: "service", title: "Top" });
		const middle = d.node({ id: "middle", kind: "service", title: "Middle" });
		const bottom = d.node({ id: "bottom", kind: "service", title: "Bottom" });
		const end = d.node({ id: "end", kind: "service", title: "End" });
		for (const target of [top, middle, bottom]) {
			d.edge(start, target, { kind: "call" });
		}
		for (const source of [top, middle, bottom]) {
			d.edge(source, end, { kind: "call" });
		}
	});
}

test("Tab enters the Diagram and arrows select the nearest Node in each direction", async () => {
	const diagram = (await mount(
		draw(navigation()).svg,
		"width: 900px; height: 400px",
	)) as PlatformDiagram;

	await userEvent.tab();

	expect(diagram.shadowRoot?.activeElement?.getAttribute("aria-label")).toBe("Navigation");
	expect(diagram.selectedNode).toBe("start");
	for (const [key, id] of [
		["ArrowRight", "top"],
		["ArrowDown", "middle"],
		["ArrowDown", "bottom"],
		["ArrowUp", "middle"],
		["ArrowRight", "end"],
		["ArrowRight", "end"],
		["ArrowLeft", "middle"],
		["ArrowUp", "top"],
		["ArrowLeft", "start"],
	] as const) {
		await userEvent.keyboard(`{${key}}`);
		expect(diagram.selectedNode, key).toBe(id);
	}
	expect(window.scrollY).toBe(0);
});

test("the camera brings keyboard selection into view in a narrow Diagram", async () => {
	const diagram = (await mount(
		draw(navigation()).svg,
		"width: 260px; height: 320px",
	)) as PlatformDiagram;

	await userEvent.tab();
	await userEvent.keyboard("{ArrowRight}{ArrowRight}");

	expect(diagram.selectedNode).toBe("end");
	const gaps = gapsOf(
		textOf(diagram, "End").getBoundingClientRect(),
		diagram.getBoundingClientRect(),
	);
	expect(Math.min(gaps.left, gaps.top, gaps.right, gaps.bottom)).toBeGreaterThanOrEqual(8);
});

test("spatial navigation follows a Diagram drawn down and leaves modified keys to the browser", async () => {
	const diagram = (await mount(
		draw(navigation("down")).svg,
		"width: 900px; height: 600px",
	)) as PlatformDiagram;
	await userEvent.tab();
	for (const [key, id] of [
		["ArrowDown", "top"],
		["ArrowRight", "middle"],
		["ArrowRight", "bottom"],
		["ArrowLeft", "middle"],
		["ArrowDown", "end"],
		["ArrowUp", "middle"],
	] as const) {
		await userEvent.keyboard(`{${key}}`);
		expect(diagram.selectedNode).toBe(id);
	}
	await userEvent.keyboard("{Control>}{ArrowLeft}{/Control}");
	expect(diagram.selectedNode).toBe("middle");
});
