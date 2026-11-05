import { afterEach, describe, expect, test } from "vitest";
import { architecture, type Diagram } from "../../src/index.ts";
import { draw } from "./support/drawing.ts";
import { gapsOf, textsOf, viewOf } from "./support/looking.ts";
import { frame, next, place, show } from "./support/page.ts";

function shop(): Diagram {
	return architecture({ title: "Shop" }, (d) => {
		const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
		const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
		d.edge(web, api, { kind: "call" });
	});
}

function warehouse(): Diagram {
	return architecture({ title: "Warehouse" }, (d) => {
		const stock = d.node({ id: "stock-api", kind: "service", title: "Stock API" });
		const db = d.node({ id: "stock-db", kind: "database", title: "Stock database" });
		d.edge(stock, db, { kind: "call" });
	});
}

const urls: string[] = [];

/** A URL that serves an SVG, as a site serves a Diagram's file. */
function served(svg: string): string {
	const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
	urls.push(url);
	return url;
}

afterEach(() => {
	for (const url of urls.splice(0)) {
		URL.revokeObjectURL(url);
	}
});

/** Waits until a Diagram draws a text, once. */
async function drawn(diagram: Element, text: string): Promise<void> {
	await expect.poll(() => textsOf(diagram, text).length).toBe(1);
	await frame();
}

/** Whether the whole drawing is in view, a little way in from every side of its frame. */
function framed(diagram: Element, scene: Parameters<typeof viewOf>[1]): boolean {
	const gaps = gapsOf(viewOf(diagram, scene).bounds, diagram.getBoundingClientRect());
	return Math.min(gaps.left, gaps.top, gaps.right, gaps.bottom) >= 8;
}

/** Each src that can't be shown, and what the page is told of it. */
const unusable: [why: string, source: () => string, reason: RegExp][] = [
	[
		"can't be reached",
		() => {
			const url = served("");
			URL.revokeObjectURL(url);
			return url;
		},
		/fetch/i,
	],
	["isn't there", () => "/no-such-folder/missing.diagram.svg", /404/],
	["isn't an SVG", () => served("<p>Not a drawing</p>"), /SVG/],
	[
		"is an SVG that says nothing of its size",
		() => served('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'),
		/viewBox/,
	],
];

describe("a Diagram given as an inline child", () => {
	test("is shown, fitted to its frame", async () => {
		const { svg, scene } = draw(shop());

		const diagram = await show(
			`<platform-diagram style="width: 400px; height: 300px">${svg}</platform-diagram>`,
		);

		expect(textsOf(diagram, "Shop API")).toHaveLength(1);
		expect(framed(diagram, scene)).toBe(true);
	});

	test("is shown when it's given after the element is in the page", async () => {
		const { svg, scene } = draw(shop());
		const diagram = await show(
			'<platform-diagram style="width: 400px; height: 300px"></platform-diagram>',
		);

		diagram.innerHTML = svg;
		await frame();

		expect(textsOf(diagram, "Shop API")).toHaveLength(1);
		expect(framed(diagram, scene)).toBe(true);
	});

	test("gives way to an SVG given as a child after it", async () => {
		const second = draw(warehouse());
		const diagram = await show(
			`<platform-diagram style="width: 400px; height: 300px">${draw(shop()).svg}</platform-diagram>`,
		);

		diagram.innerHTML = second.svg;
		await frame();

		expect(textsOf(diagram, "Shop API")).toEqual([]);
		expect(textsOf(diagram, "Stock database")).toHaveLength(1);
		expect(framed(diagram, second.scene)).toBe(true);
	});

	test("stays on the stage when the element moves to another place in the page", async () => {
		const { svg, scene } = draw(shop());
		const diagram = await show(
			`<platform-diagram style="width: 400px; height: 300px">${svg}</platform-diagram>`,
		);

		place(diagram);
		diagram.style.width = "620px";
		await frame();

		expect(textsOf(diagram, "Shop API")).toHaveLength(1);
		expect(framed(diagram, scene)).toBe(true);
		expect(viewOf(diagram, scene).scale).toBeGreaterThan(0.9);
	});

	test("tells the page when its SVG isn't one the engine made, and goes on to show its src", async () => {
		const diagram = document.createElement("platform-diagram");
		diagram.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><text>Hand-drawn</text></svg>';
		diagram.setAttribute("src", served(draw(shop()).svg));
		const failed = next(diagram, "error");
		const loaded = next(diagram, "load");

		place(diagram);

		expect(((await failed) as ErrorEvent).message).toMatch(/viewBox/);
		await loaded;
		expect(textsOf(diagram, "Hand-drawn")).toEqual([]);
		expect(textsOf(diagram, "Shop API")).toHaveLength(1);
	});
});

describe("a Diagram that the page is still parsing when the element is defined", () => {
	test("is shown as it arrives, fitted, and drawn in its own font once the page has it whole", async () => {
		const { svg, scene } = draw(shop());
		// A page of its own, written piece by piece, as a slow page arrives.
		const inner = place(document.createElement("iframe"));
		inner.style.cssText = "width: 700px; height: 400px";
		const page = inner.contentDocument as Document;
		const view = inner.contentWindow as Window & typeof globalThis;
		const later = () =>
			new Promise((resolve) =>
				view.requestAnimationFrame(() => view.requestAnimationFrame(resolve)),
			);
		const component = new URL("../../src/web-component/index.ts", import.meta.url).href;
		page.open();
		page.write(`<!doctype html><script type="module" async src="${component}"></script><body>`);
		await expect.poll(() => view.customElements.get("platform-diagram") !== undefined).toBe(true);

		// The SVG arrives as far as its style, which declares its font, and then the rest.
		const cut = svg.indexOf("<style>");
		page.write(`<platform-diagram style="width: 620px; height: 300px">${svg.slice(0, cut)}`);
		await later();
		page.write(`${svg.slice(cut)}</platform-diagram>`);
		page.close();
		await later();

		const diagram = page.querySelector("platform-diagram") as HTMLElement;
		const title = [...(diagram.shadowRoot?.querySelectorAll("text") ?? [])].find(
			(text) => text.textContent === "Shop API",
		) as SVGTextContentElement;
		// Fitted: both titles are in the 620 px frame, though the SVG is 496 px wide as drawn.
		const frame = diagram.getBoundingClientRect();
		const titles = [...(diagram.shadowRoot?.querySelectorAll("text") ?? [])].map((text) =>
			text.getBoundingClientRect(),
		);
		expect(titles).toHaveLength(2);
		expect(Math.min(...titles.map((box) => box.left))).toBeGreaterThan(frame.left + 16);
		expect(Math.max(...titles.map((box) => box.right))).toBeLessThan(frame.right - 16);
		// In its own font: as wide as the core measured it.
		await expect
			.poll(() => Math.abs(title.getComputedTextLength() - (scene.nodes[1]?.title.width ?? 0)))
			.toBeLessThan(0.15);
	});
});

describe("a Diagram given as a src URL", () => {
	test("is shown, fitted to its frame", async () => {
		const { svg, scene } = draw(shop());

		const diagram = await show(
			`<platform-diagram src="${served(svg)}" style="width: 400px; height: 300px"></platform-diagram>`,
		);

		await drawn(diagram, "Shop API");
		expect(framed(diagram, scene)).toBe(true);
	});

	test("gives way to the Diagram of a new src", async () => {
		const first = draw(shop());
		const second = draw(warehouse());
		const diagram = await show(
			`<platform-diagram src="${served(first.svg)}" style="width: 400px; height: 300px"></platform-diagram>`,
		);
		await drawn(diagram, "Shop API");

		diagram.setAttribute("src", served(second.svg));

		await drawn(diagram, "Stock database");
		expect(textsOf(diagram, "Shop API")).toEqual([]);
		expect(framed(diagram, second.scene)).toBe(true);
	});

	test("is dropped when the element leaves the page before it has loaded, and loaded again when it's back", async () => {
		const diagram = document.createElement("platform-diagram");
		diagram.setAttribute("src", served(draw(shop()).svg));
		const heard: string[] = [];
		diagram.addEventListener("load", () => heard.push("load"));
		diagram.addEventListener("error", () => heard.push("error"));

		place(diagram).remove();
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(heard).toEqual([]);

		const loaded = next(diagram, "load");
		place(diagram);
		await loaded;
		expect(textsOf(diagram, "Shop API")).toHaveLength(1);
		expect(heard).toEqual(["load"]);
	});

	test("takes the place of an inline child, which shows until it has loaded", async () => {
		const diagram = document.createElement("platform-diagram");
		diagram.innerHTML = draw(shop()).svg;
		diagram.setAttribute("src", served(draw(warehouse()).svg));
		const loaded = next(diagram, "load");

		place(diagram);

		expect(textsOf(diagram, "Shop API")).toHaveLength(1);
		await loaded;
		expect(textsOf(diagram, "Shop API")).toEqual([]);
		expect(textsOf(diagram, "Stock database")).toHaveLength(1);
	});

	test.for(unusable)(
		"tells the page, and keeps the Diagram it shows, when a new src %s",
		async ([, source, reason]) => {
			const diagram = await show(
				`<platform-diagram style="width: 400px; height: 300px">${draw(shop()).svg}</platform-diagram>`,
			);
			const failed = next(diagram, "error");

			diagram.setAttribute("src", source());

			const event = await failed;
			expect(event).toBeInstanceOf(ErrorEvent);
			expect((event as ErrorEvent).message).toMatch(reason);
			expect(textsOf(diagram, "Shop API")).toHaveLength(1);
		},
	);
});
