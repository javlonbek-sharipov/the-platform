import { describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import example from "../../docs/example-system.diagram.ts";
import { architecture, type Diagram, type Direction } from "../../src/index.ts";
import { draw } from "./support/drawing.ts";
import { gapsOf, middleOf, textOf, viewOf } from "./support/looking.ts";
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

/** A chain of Nodes drawn `down`, 1104 px high: higher than the window the tests run in. */
function tower(): Diagram {
	return architecture({ title: "Tower", direction: "down" }, (d) => {
		const floors = Array.from({ length: 8 }, (_, index) =>
			d.node({ id: `floor-${index + 1}`, kind: "service", title: `Floor ${index + 1}` }),
		);
		floors.slice(1).forEach((floor, index) => {
			d.edge(floors[index] ?? floor, floor, { kind: "call" });
		});
	});
}

describe("the component's size", () => {
	test("is the size the page gives it", async () => {
		const diagram = await mount(draw(shop()).svg, "width: 600px; height: 300px");

		const frame = diagram.getBoundingClientRect();
		expect(frame.width).toBe(600);
		expect(frame.height).toBe(300);
	});

	test.for([
		["narrower than its drawing", "width: 620px"],
		["too narrow to show its drawing whole", "width: 400px"],
		["wider than its drawing", "width: 1200px"],
	] as const)(
		"without a height, hugs its drawing as Fit frames it, when it's %s",
		async ([, style]) => {
			const { svg, scene } = draw(shop());

			const diagram = await mount(svg, style);

			const gaps = gapsOf(viewOf(diagram, scene).bounds, diagram.getBoundingClientRect());
			// Above and below the drawing, only the padding is left.
			expect(gaps.top).toBeGreaterThanOrEqual(8);
			expect(gaps.top).toBeLessThanOrEqual(32);
			expect(gaps.bottom).toBeCloseTo(gaps.top, 0);
		},
	);

	test("without a height, stops short of the window's, so that the page can be scrolled past it", async () => {
		const { svg, scene } = draw(tower());

		const diagram = await mount(svg, "width: 600px");

		const frame = diagram.getBoundingClientRect();
		expect(frame.height).toBeGreaterThan(window.innerHeight / 2);
		expect(frame.height).toBeLessThanOrEqual(window.innerHeight * 0.9);
		// The drawing starts at its top, and its foot is out of view.
		const gaps = gapsOf(viewOf(diagram, scene).bounds, frame);
		expect(gaps.top).toBeGreaterThanOrEqual(8);
		expect(gaps.top).toBeLessThanOrEqual(32);
		expect(gaps.bottom).toBeLessThan(0);
	});
});

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

describe("the keyboard", () => {
	test("zooms in with +, out with −, around the middle of the view, and fits with 0", async () => {
		const { svg, scene } = draw(example);
		const diagram = await mount(svg, "width: 800px; height: 420px");
		const middle = middleOf(diagram);
		const fitted = viewOf(diagram, scene);
		const held = fitted.at(middle);

		await userEvent.tab();
		await userEvent.keyboard("++");

		const closer = viewOf(diagram, scene);
		expect(closer.scale).toBeGreaterThan(fitted.scale * 1.4);
		expect(closer.point(held).x).toBeCloseTo(middle.x, 0);
		expect(closer.point(held).y).toBeCloseTo(middle.y, 0);

		await userEvent.keyboard("-");

		const further = viewOf(diagram, scene);
		expect(further.scale).toBeLessThan(closer.scale * 0.9);
		expect(further.scale).toBeGreaterThan(fitted.scale * 1.1);
		expect(further.point(held).x).toBeCloseTo(middle.x, 0);
		expect(further.point(held).y).toBeCloseTo(middle.y, 0);

		await userEvent.keyboard("0");

		const again = viewOf(diagram, scene);
		expect(again.scale).toBeCloseTo(fitted.scale, 5);
		expect(again.bounds.left).toBeCloseTo(fitted.bounds.left, 1);
		expect(again.bounds.top).toBeCloseTo(fitted.bounds.top, 1);
	});

	test("stops zooming in while the drawing is still easy to take in", async () => {
		const { svg, scene } = draw(shop());
		const diagram = await mount(svg, "width: 600px; height: 300px");
		await userEvent.tab();

		await userEvent.keyboard("+".repeat(30));

		const closest = viewOf(diagram, scene).scale;
		expect(closest).toBeGreaterThanOrEqual(2);
		expect(closest).toBeLessThanOrEqual(8);
		await userEvent.keyboard("+");
		expect(viewOf(diagram, scene).scale).toBeCloseTo(closest, 5);
	});

	test("stops zooming out once the whole drawing is in view, in the middle", async () => {
		const { svg, scene } = draw(example);
		const diagram = await mount(svg, "width: 800px; height: 420px");
		await userEvent.tab();

		await userEvent.keyboard("-".repeat(30));

		const furthest = viewOf(diagram, scene);
		const gaps = gapsOf(furthest.bounds, diagram.getBoundingClientRect());
		expect(Math.min(gaps.left, gaps.top, gaps.right, gaps.bottom)).toBeGreaterThanOrEqual(8);
		expect(gaps.left).toBeLessThanOrEqual(32);
		expect(gaps.left).toBeCloseTo(gaps.right, 0);
		expect(gaps.top).toBeCloseTo(gaps.bottom, 0);
		await userEvent.keyboard("-");
		expect(viewOf(diagram, scene).scale).toBeCloseTo(furthest.scale, 5);
	});

	test("zooms a drawing that fits whole out no further than its text stays readable", async () => {
		const { svg, scene } = draw(shop());
		const diagram = await mount(svg, "width: 1200px; height: 400px");
		await userEvent.tab();

		await userEvent.keyboard("-".repeat(30));

		const furthest = viewOf(diagram, scene);
		const gaps = gapsOf(furthest.bounds, diagram.getBoundingClientRect());
		expect(furthest.scale).toBeLessThan(1);
		expect(furthest.scale).toBeGreaterThanOrEqual(readable);
		expect(gaps.left).toBeCloseTo(gaps.right, 0);
		expect(gaps.top).toBeCloseTo(gaps.bottom, 0);
	});

	test("zooms in with = too, which is + without Shift", async () => {
		const { svg, scene } = draw(shop());
		const diagram = await mount(svg, "width: 600px; height: 300px");
		const fitted = viewOf(diagram, scene).scale;
		await userEvent.tab();

		await userEvent.keyboard("=");

		expect(viewOf(diagram, scene).scale).toBeGreaterThan(fitted * 1.1);
	});

	test.for(["Control", "Meta", "Alt"])(
		"leaves +, − and 0 to the browser while %s is held",
		async (modifier) => {
			const { svg, scene } = draw(example);
			const diagram = await mount(svg, "width: 800px; height: 420px");
			await userEvent.tab();
			await userEvent.keyboard("+");
			const before = viewOf(diagram, scene);

			await userEvent.keyboard(`{${modifier}>}+-0{/${modifier}}`);

			const after = viewOf(diagram, scene);
			expect(after.scale).toBeCloseTo(before.scale, 5);
			expect(after.bounds.left).toBeCloseTo(before.bounds.left, 1);
		},
	);
});

describe("a view the reader chose", () => {
	test("stays when the frame changes size, until the reader fits the drawing again", async () => {
		const { svg, scene } = draw(shop());
		const diagram = await mount(svg, "width: 1200px; height: 400px");
		await userEvent.tab();
		await userEvent.keyboard("++");
		const chosen = viewOf(diagram, scene);
		const corner = {
			x: diagram.getBoundingClientRect().left,
			y: diagram.getBoundingClientRect().top,
		};
		const held = chosen.at(corner);

		diagram.style.width = "1000px";
		await frame();

		const kept = viewOf(diagram, scene);
		expect(kept.scale).toBeCloseTo(chosen.scale, 5);
		expect(kept.point(held).x).toBeCloseTo(corner.x, 0);
		expect(kept.point(held).y).toBeCloseTo(corner.y, 0);

		await userEvent.keyboard("0");
		diagram.style.width = "620px";
		await frame();

		const fitted = viewOf(diagram, scene);
		const gaps = gapsOf(fitted.bounds, diagram.getBoundingClientRect());
		expect(fitted.scale).toBeLessThan(1);
		expect(Math.min(gaps.left, gaps.top, gaps.right, gaps.bottom)).toBeGreaterThanOrEqual(8);
	});
});
