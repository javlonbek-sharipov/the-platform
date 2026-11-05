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
