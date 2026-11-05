import { describe, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import example from "../../docs/example-system.diagram.ts";
import { architecture, type Diagram, type Direction, type Point } from "../../src/index.ts";
import { draw } from "./support/drawing.ts";
import { drag, letGo, moveTo, press, touch, wheel } from "./support/input.ts";
import { gapsOf, middleOf, textOf, viewOf } from "./support/looking.ts";
import { frame, mount, next, show } from "./support/page.ts";

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
	test("is nothing while the component is hidden", async () => {
		const diagram = await show(`<platform-diagram hidden>${draw(shop()).svg}</platform-diagram>`);

		expect(diagram.getBoundingClientRect().height).toBe(0);

		diagram.hidden = false;
		await frame();
		expect(diagram.getBoundingClientRect().height).toBeGreaterThan(100);
	});

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

/** How far each of a Diagram's texts moved on the screen since `before` was taken. */
function shiftOf(before: Map<Element, DOMRect>): Point[] {
	return [...before].map(([element, was]) => {
		const now = element.getBoundingClientRect();
		return { x: now.left - was.left, y: now.top - was.top };
	});
}

/** Where each of the texts given is on the screen now. */
function placesOf(texts: Element[]): Map<Element, DOMRect> {
	return new Map(texts.map((text) => [text, text.getBoundingClientRect()]));
}

describe("dragging", () => {
	test("pans the drawing with the pointer", async () => {
		const diagram = await mount(draw(example).svg, "width: 800px; height: 420px");
		// Closer, the drawing is larger than its frame both ways, so it can move both ways.
		await userEvent.tab();
		await userEvent.keyboard("++");
		const before = placesOf([textOf(diagram, "Shop gateway"), textOf(diagram, "Fraud check")]);

		await drag(diagram, { x: 600, y: 300 }, { x: 480, y: 240 });

		for (const shift of shiftOf(before)) {
			expect(shift.x).toBeCloseTo(-120, 0);
			expect(shift.y).toBeCloseTo(-60, 0);
		}
	});

	test("stops where an end of the drawing comes a padding in from the frame's side", async () => {
		const { svg, scene } = draw(example);
		const diagram = await mount(svg, "width: 800px; height: 420px");
		const frame = diagram.getBoundingClientRect();

		// The drawing is 1641 px wide on the screen: four drags of 700 px pass its end.
		for (let turn = 0; turn < 4; turn += 1) {
			await drag(diagram, { x: 750, y: 200 }, { x: 50, y: 200 });
		}
		const far = gapsOf(viewOf(diagram, scene).bounds, frame);
		expect(far.right).toBeGreaterThanOrEqual(8);
		expect(far.right).toBeLessThanOrEqual(32);

		for (let turn = 0; turn < 4; turn += 1) {
			await drag(diagram, { x: 50, y: 200 }, { x: 750, y: 200 });
		}
		const near = gapsOf(viewOf(diagram, scene).bounds, frame);
		expect(near.left).toBeGreaterThanOrEqual(8);
		expect(near.left).toBeLessThanOrEqual(32);
	});

	test("leaves a drawing that's whole in view where it is", async () => {
		const diagram = await mount(draw(shop()).svg, "width: 600px; height: 300px");
		const before = placesOf([textOf(diagram, "Shop API")]);

		await drag(diagram, { x: 300, y: 150 }, { x: 400, y: 220 });

		expect(shiftOf(before)).toEqual([{ x: 0, y: 0 }]);
	});

	test("goes on when the pointer leaves the frame", async () => {
		const diagram = await mount(draw(example).svg, "width: 800px; height: 420px; margin: 40px");
		const before = placesOf([textOf(diagram, "Shop gateway")]);

		await drag(diagram, { x: 600, y: 200 }, { x: 300, y: 200 }, { x: -20, y: 200 });

		expect(shiftOf(before)[0]?.x).toBeCloseTo(-620, 0);
	});

	test("keeps what the wheel zoomed while the button was down", async () => {
		const diagram = await mount(draw(example).svg, "width: 800px; height: 420px");
		const gateway = textOf(diagram, "Shop gateway");
		const before = gateway.getBoundingClientRect().width;

		await press(diagram, { x: 600, y: 200 }, { x: 560, y: 200 });
		await wheel(diagram, { x: 560, y: 200 }, -100, "Control");
		const zoomed = gateway.getBoundingClientRect();
		await moveTo(diagram, { x: 500, y: 200 });
		await letGo();

		const after = gateway.getBoundingClientRect();
		expect(zoomed.width).toBeGreaterThan(before * 1.1);
		expect(after.width).toBeCloseTo(zoomed.width, 3);
		expect(after.left - zoomed.left).toBeCloseTo(-60, 0);
	});

	test("takes the main mouse button, and no other", async () => {
		const diagram = await mount(draw(example).svg, "width: 800px; height: 420px");
		const before = placesOf([textOf(diagram, "Shop gateway")]);

		await userEvent.pointer([
			{ target: diagram, coords: { x: 600, y: 200 }, keys: "[MouseRight>]" },
			{ target: diagram, coords: { x: 480, y: 200 } },
			{ keys: "[/MouseRight]" },
		]);

		expect(shiftOf(before)).toEqual([{ x: 0, y: 0 }]);
	});

	test("shows a hand over the drawing, which closes while it drags", async () => {
		const diagram = await mount(draw(example).svg, "width: 800px; height: 420px");
		const gateway = textOf(diagram, "Shop gateway");

		expect(getComputedStyle(gateway).cursor).toBe("grab");
		await press(diagram, { x: 600, y: 200 }, { x: 560, y: 200 });
		expect(getComputedStyle(gateway).cursor).toBe("grabbing");
		await letGo();
		expect(getComputedStyle(gateway).cursor).toBe("grab");
	});

	test("isn't a click", async () => {
		const diagram = await mount(draw(example).svg, "width: 800px; height: 420px");
		const clicks: Event[] = [];
		const heard = (event: Event) => clicks.push(event);
		// As a page hears clicks: on the element, and on the document, for every element at once.
		document.addEventListener("click", heard, { capture: true });
		diagram.addEventListener("click", heard);

		await drag(diagram, { x: 600, y: 200 }, { x: 480, y: 200 });

		expect(clicks).toEqual([]);
		// The next click is one again.
		await userEvent.click(textOf(diagram, "Shop gateway"));
		expect(clicks).toHaveLength(2);
		document.removeEventListener("click", heard, { capture: true });
	});

	test("selects no text", async () => {
		const diagram = await mount(draw(example).svg, "width: 800px; height: 420px");
		const title = textOf(diagram, "Shop web app").getBoundingClientRect();
		const frame = diagram.getBoundingClientRect();
		const start = { x: title.left - frame.left + 4, y: title.top - frame.top + 8 };

		await drag(diagram, start, { x: start.x + 300, y: start.y + 40 });

		expect(String(getSelection())).toBe("");
	});
});

describe("a click", () => {
	test("stays a click on what was pressed, though the pointer moved a few pixels, and pans nothing", async () => {
		const diagram = await mount(draw(example).svg, "width: 800px; height: 420px");
		const title = textOf(diagram, "Shop web app");
		const before = placesOf([title]);
		const pressed: EventTarget[] = [];
		diagram.addEventListener("click", (event) => pressed.push(event.composedPath()[0] ?? diagram));
		const box = title.getBoundingClientRect();
		const frame = diagram.getBoundingClientRect();
		const start = { x: box.left - frame.left + 10, y: box.top - frame.top + 8 };

		await drag(diagram, start, { x: start.x + 2, y: start.y + 2 });

		expect(pressed).toEqual([title]);
		expect(shiftOf(before)).toEqual([{ x: 0, y: 0 }]);
	});
});

/** A page long enough to scroll, with the example in a Diagram at its top. */
function longPage(): Promise<HTMLElement> {
	return show(
		`<div style="height: 3000px">
			<platform-diagram style="width: 800px; height: 420px">${draw(example).svg}</platform-diagram>
			<button type="button">Elsewhere</button>
		</div>`,
	);
}

/** Where a text's middle is, counted from its Diagram's top left corner. */
function placeIn(diagram: Element, text: Element): Point {
	const frame = diagram.getBoundingClientRect();
	const middle = middleOf(text);
	return { x: middle.x - frame.left, y: middle.y - frame.top };
}

describe("the mouse wheel", () => {
	test("scrolls the page, and leaves the view alone, while the Diagram hasn't the focus", async () => {
		const diagram = await longPage();
		const gateway = textOf(diagram, "Shop gateway");
		const before = gateway.getBoundingClientRect().width;

		await wheel(diagram, placeIn(diagram, gateway), 200);

		await expect.poll(() => window.scrollY).toBe(200);
		expect(gateway.getBoundingClientRect().width).toBeCloseTo(before, 5);
	});

	test("zooms around the pointer once the Diagram has the focus, and the page stays where it is", async () => {
		const diagram = await longPage();
		const gateway = textOf(diagram, "Shop gateway");
		const before = gateway.getBoundingClientRect();
		const pointer = placeIn(diagram, gateway);

		await userEvent.click(diagram);
		await wheel(diagram, pointer, -100);
		await frame();

		// The text under the pointer is larger, and still under the pointer.
		const closer = gateway.getBoundingClientRect();
		expect(closer.width).toBeGreaterThan(before.width * 1.1);
		expect(placeIn(diagram, gateway).x).toBeCloseTo(pointer.x, 0);
		expect(placeIn(diagram, gateway).y).toBeCloseTo(pointer.y, 0);

		await wheel(diagram, pointer, 100);
		await frame();

		// The wheel turned back takes the drawing as far off again.
		const back = gateway.getBoundingClientRect();
		expect(back.width).toBeCloseTo(before.width, 1);
		expect(placeIn(diagram, gateway).x).toBeCloseTo(pointer.x, 0);
		expect(window.scrollY).toBe(0);
	});

	test("scrolls the page again once the focus has left the Diagram", async () => {
		const diagram = await longPage();
		const gateway = textOf(diagram, "Shop gateway");
		await userEvent.click(diagram);
		await userEvent.click(page.getByRole("button", { name: "Elsewhere" }));
		const before = gateway.getBoundingClientRect().width;

		await wheel(diagram, placeIn(diagram, gateway), 200);

		await expect.poll(() => window.scrollY).toBe(200);
		expect(gateway.getBoundingClientRect().width).toBeCloseTo(before, 5);
	});

	test.for(["Control", "Meta"] as const)(
		"zooms while %s is held, though the Diagram hasn't the focus",
		async (key) => {
			const diagram = await longPage();
			const gateway = textOf(diagram, "Shop gateway");
			const before = gateway.getBoundingClientRect().width;
			const pointer = placeIn(diagram, gateway);

			await wheel(diagram, pointer, -100, key);
			await frame();

			expect(gateway.getBoundingClientRect().width).toBeGreaterThan(before * 1.1);
			expect(placeIn(diagram, gateway).x).toBeCloseTo(pointer.x, 0);
			expect(window.scrollY).toBe(0);
		},
	);
});

describe("touch", () => {
	test("zooms where two fingers spread, and pans as they move together", async () => {
		const diagram = await mount(draw(example).svg, "width: 800px; height: 420px");
		const gateway = textOf(diagram, "Shop gateway");
		const before = gateway.getBoundingClientRect().width;
		// The fingers land either side of the text, and spread to twice as far apart.
		const { x, y } = placeIn(diagram, gateway);

		await touch(
			diagram,
			[
				{ x: x - 100, y },
				{ x: x + 100, y },
			],
			[
				{ x: x - 150, y },
				{ x: x + 150, y },
			],
			[
				{ x: x - 200, y },
				{ x: x + 200, y },
			],
		);
		await frame();

		// The text between them is twice as large, and still between them.
		expect(gateway.getBoundingClientRect().width).toBeCloseTo(before * 2, 0);
		expect(placeIn(diagram, gateway).x).toBeCloseTo(x, 0);
		expect(placeIn(diagram, gateway).y).toBeCloseTo(y, 0);

		await touch(
			diagram,
			[
				{ x: x - 100, y },
				{ x: x + 100, y },
			],
			[
				{ x: x - 150, y: y + 30 },
				{ x: x + 50, y: y + 30 },
			],
		);
		await frame();

		// Fingers that keep their distance move the drawing with them, no larger.
		expect(gateway.getBoundingClientRect().width).toBeCloseTo(before * 2, 0);
		expect(placeIn(diagram, gateway).x).toBeCloseTo(x - 50, 0);
		expect(placeIn(diagram, gateway).y).toBeCloseTo(y + 30, 0);
	});

	test("pans with one finger", async () => {
		const diagram = await mount(draw(example).svg, "width: 800px; height: 420px");
		const before = placesOf([textOf(diagram, "Shop gateway")]);

		await touch(diagram, [{ x: 600, y: 200 }], [{ x: 520, y: 200 }], [{ x: 400, y: 200 }]);
		await frame();

		expect(shiftOf(before)[0]?.x).toBeCloseTo(-200, 0);
	});

	test("takes a tap for a click, though the finger moved more than a mouse would", async () => {
		const diagram = await mount(draw(example).svg, "width: 800px; height: 420px");
		const title = textOf(diagram, "Shop web app");
		const before = placesOf([title]);
		const pressed: EventTarget[] = [];
		diagram.addEventListener("click", (event) => pressed.push(event.composedPath()[0] ?? diagram));
		const { x, y } = placeIn(diagram, title);

		await touch(diagram, [{ x, y }], [{ x: x + 5, y: y + 3 }]);
		await expect.poll(() => pressed).toEqual([title]);

		expect(shiftOf(before)).toEqual([{ x: 0, y: 0 }]);
	});
});

describe("the keyboard's focus", () => {
	test("comes to the Diagram with Tab, and finds it named by its title", async () => {
		const diagram = await mount(draw(shop()).svg, "width: 600px; height: 300px");

		await userEvent.tab();

		expect(document.activeElement).toBe(diagram);
		expect(page.getByRole("group", { name: "Shop" }).element().matches(":focus")).toBe(true);
	});

	test("stays on the Diagram when a new SVG takes the old one's place", async () => {
		const { svg, scene } = draw(shop());
		const diagram = await mount(draw(example).svg, "width: 600px; height: 300px");
		await userEvent.tab();
		const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
		const loaded = next(diagram, "load");

		diagram.setAttribute("src", url);
		await loaded;
		URL.revokeObjectURL(url);
		await frame();

		expect(document.activeElement).toBe(diagram);
		expect(page.getByRole("group", { name: "Shop" }).element().matches(":focus")).toBe(true);
		const fitted = viewOf(diagram, scene).scale;
		await userEvent.keyboard("+");
		expect(viewOf(diagram, scene).scale).toBeGreaterThan(fitted * 1.1);
	});
});

describe("a view the reader left as Fit made it", () => {
	test("is fitted again when the frame changes size, though the reader pressed and dragged to no effect", async () => {
		const { svg, scene } = draw(shop());
		const diagram = await mount(svg, "width: 1200px; height: 400px");
		// The whole drawing is in view, so a drag has nowhere to take it.
		await drag(diagram, { x: 600, y: 200 }, { x: 500, y: 150 });

		diagram.style.width = "620px";
		await frame();

		const fitted = viewOf(diagram, scene);
		const gaps = gapsOf(fitted.bounds, diagram.getBoundingClientRect());
		expect(fitted.scale).toBeLessThan(1);
		expect(Math.min(gaps.left, gaps.top, gaps.right, gaps.bottom)).toBeGreaterThanOrEqual(8);
	});
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
