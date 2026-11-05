import { describe, expect, test } from "vitest";
import example from "../../docs/example-system.diagram.ts";
import { architecture, type Diagram, type Direction } from "../../src/index.ts";
import { draw } from "./support/drawing.ts";
import { gapsOf, textOf, viewOf } from "./support/looking.ts";
import { frame, mount } from "./support/page.ts";

/**
 * Three Nodes in a line. Drawn `right`, its drawing is 768 px wide and 96 px
 * high, and drawn `down`, 224 px wide and 384 px high.
 */
function shop(direction: Direction = "right"): Diagram {
	return architecture({ title: "Shop", direction }, (d) => {
		const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
		const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
		const db = d.node({ id: "shop-db", kind: "database", title: "Shop database" });
		d.edge(web, api, { kind: "call" });
		d.edge(api, db, { kind: "call" });
	});
}

/** The smallest a Row's text, 12 px in the drawing, may get on the screen and still be read. */
const readable = 8 / 12;

describe("fit", () => {
	test("shows the whole drawing, in the middle, with some padding around it", async () => {
		const { svg, scene } = draw(shop());

		const diagram = await mount(svg, "width: 600px; height: 300px");

		const gaps = gapsOf(viewOf(diagram, scene).bounds, diagram.getBoundingClientRect());
		// The whole drawing is in view, a little way in from every side.
		expect(Math.min(gaps.left, gaps.top, gaps.right, gaps.bottom)).toBeGreaterThanOrEqual(8);
		expect(gaps.left).toBeCloseTo(gaps.right, 0);
		expect(gaps.top).toBeCloseTo(gaps.bottom, 0);
		// It's as large as that allows: across, only the padding is left.
		expect(gaps.left).toBeLessThanOrEqual(32);
	});

	test("shows a drawing smaller than its frame at its natural size", async () => {
		const { svg, scene } = draw(shop());

		const diagram = await mount(svg, "width: 1200px; height: 400px");

		const view = viewOf(diagram, scene);
		const gaps = gapsOf(view.bounds, diagram.getBoundingClientRect());
		expect(view.scale).toBeCloseTo(1, 3);
		expect(gaps.left).toBeCloseTo(gaps.right, 0);
		expect(gaps.top).toBeCloseTo(gaps.bottom, 0);
	});

	test("fits again when its frame changes size", async () => {
		const { svg, scene } = draw(shop());
		const diagram = await mount(svg, "width: 1200px; height: 400px");

		diagram.style.width = "620px";
		await frame();

		const view = viewOf(diagram, scene);
		const gaps = gapsOf(view.bounds, diagram.getBoundingClientRect());
		expect(view.scale).toBeLessThan(1);
		expect(Math.min(gaps.left, gaps.top, gaps.right, gaps.bottom)).toBeGreaterThanOrEqual(8);
		expect(gaps.left).toBeCloseTo(gaps.right, 0);
		expect(gaps.left).toBeLessThanOrEqual(32);
	});

	test("keeps a drawing too wide for its frame readable, and starts at its left, where its sources are", async () => {
		// The example is 2344 px wide and 496 px high, drawn `right`.
		const { svg, scene } = draw(example);

		const diagram = await mount(svg, "width: 480px; height: 420px");

		const frame = diagram.getBoundingClientRect();
		const view = viewOf(diagram, scene);
		const gaps = gapsOf(view.bounds, frame);
		expect(view.scale).toBeGreaterThanOrEqual(readable);
		// The left side is in view, a padding in, and the rest runs out of the frame.
		expect(gaps.left).toBeGreaterThanOrEqual(8);
		expect(gaps.left).toBeLessThanOrEqual(32);
		expect(gaps.right).toBeLessThan(0);
		expect(gapsOf(textOf(diagram, "Shopper").getBoundingClientRect(), frame).left).toBeGreaterThan(
			0,
		);
		// Its height fits, so it's in the middle from top to bottom.
		expect(gaps.top).toBeGreaterThanOrEqual(8);
		expect(gaps.top).toBeCloseTo(gaps.bottom, 0);
	});

	test("starts a drawing too high for its frame at its top, where the sources of a Diagram drawn down are", async () => {
		const { svg, scene } = draw(shop("down"));

		const diagram = await mount(svg, "width: 300px; height: 200px");

		const frame = diagram.getBoundingClientRect();
		const view = viewOf(diagram, scene);
		const gaps = gapsOf(view.bounds, frame);
		expect(view.scale).toBeGreaterThanOrEqual(readable);
		expect(gaps.top).toBeGreaterThanOrEqual(8);
		expect(gaps.top).toBeLessThanOrEqual(32);
		expect(gaps.bottom).toBeLessThan(0);
		expect(gapsOf(textOf(diagram, "Web app").getBoundingClientRect(), frame).top).toBeGreaterThan(
			0,
		);
		// Its width fits, so it's in the middle from side to side.
		expect(gaps.left).toBeGreaterThanOrEqual(8);
		expect(gaps.left).toBeCloseTo(gaps.right, 0);
	});
});
