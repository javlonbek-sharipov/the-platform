import { afterEach, describe, expect, test } from "vitest";
import { cdp, userEvent } from "vitest/browser";
import example from "../../docs/example-system.diagram.ts";
import { architecture, type Diagram } from "../../src/index.ts";
import { draw } from "./support/drawing.ts";
import { colorsAt, textsOf, viewOf } from "./support/looking.ts";
import { frame, mount, next, show } from "./support/page.ts";

/** Three Nodes in a row: 768 px wide and 96 px high, so a higher frame leaves room above and below it. */
function shop(): Diagram {
	return architecture({ title: "Shop" }, (d) => {
		const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
		const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
		const db = d.node({ id: "shop-db", kind: "database", title: "Shop database" });
		d.edge(web, api, { kind: "call" });
		d.edge(api, db, { kind: "call" });
	});
}

/** The scheme a reader's system asks pages for. */
async function prefer(scheme: "light" | "dark"): Promise<void> {
	await cdp().send("Emulation.setEmulatedMedia", {
		features: [{ name: "prefers-color-scheme", value: scheme }],
	});
}

afterEach(async () => {
	await cdp().send("Emulation.setEmulatedMedia", { features: [] });
});

/** The Shop in a frame with room around its drawing, inside a page styled as given. */
async function shown(pageStyle = "") {
	const { svg, scene } = draw(shop());
	const diagram = await show(
		`<div style="padding: 20px; ${pageStyle}">
			<platform-diagram style="width: 600px; height: 300px">${svg}</platform-diagram>
		</div>`,
	);
	const box = diagram.getBoundingClientRect();
	const { bounds } = viewOf(diagram, scene);
	return {
		diagram,
		/** A point of the frame above the drawing, where only the component paints. */
		around: { x: box.left + 300, y: box.top + 30 },
		/** A point in the drawing's own corner, where only its background is painted. */
		within: { x: bounds.left + 3, y: bounds.top + 3 },
		/** A point on the frame's left edge, where the mark of the keyboard's focus is drawn. */
		edge: { x: box.left + 1, y: box.top + 150 },
	};
}

describe("the component's colors", () => {
	test("are the drawing's own where the page sets none, in light and in dark", async () => {
		await prefer("light");
		const light = await shown();
		const [lightAround, lightWithin] = await colorsAt(light.around, light.within);
		expect(lightAround).toBe(lightWithin);

		await prefer("dark");
		await frame();
		const [darkAround, darkWithin] = await colorsAt(light.around, light.within);
		expect(darkAround).toBe(darkWithin);
		expect(darkAround).not.toBe(lightAround);
	});

	test("are the page's, where it sets the SVG's --diagram- properties", async () => {
		const { around, within } = await shown("--diagram-background: rgb(250, 240, 200)");

		expect(await colorsAt(around, within)).toEqual(["rgb(250, 240, 200)", "rgb(250, 240, 200)"]);
	});

	test("mark the Diagram that the keyboard is on with the page's accent", async () => {
		const { around, edge } = await shown(
			"--diagram-background: rgb(250, 240, 200); --diagram-accent: rgb(200, 0, 100)",
		);
		expect(await colorsAt(edge)).toEqual(["rgb(250, 240, 200)"]);

		await userEvent.tab();

		expect(await colorsAt(edge, around)).toEqual(["rgb(200, 0, 100)", "rgb(250, 240, 200)"]);
	});

	test("leave the mark out when the focus came with a click", async () => {
		const { diagram, edge } = await shown("--diagram-background: rgb(250, 240, 200)");

		await userEvent.click(diagram);

		expect(await colorsAt(edge)).toEqual(["rgb(250, 240, 200)"]);
	});

	test("mark the keyboard's focus with the theme's accent where the page sets none, lighter in dark", async () => {
		await prefer("light");
		const { edge } = await shown();
		await userEvent.tab();
		const [light] = await colorsAt(edge);

		await prefer("dark");
		await frame();
		const [dark] = await colorsAt(edge);

		// The theme's accent: #bf3989 in light, and #db61a2 in dark.
		expect(light).toBe("rgb(191, 57, 137)");
		expect(dark).toBe("rgb(219, 97, 162)");
	});
});

/** The font faces that Diagrams have declared on the page: each SVG's family is named after its contents. */
function declaredFaces(): FontFace[] {
	return [...document.fonts].filter((face) => face.family.includes("diagram-"));
}

describe("the SVG's embedded font", () => {
	test("draws every text, as wide as the core measured it", async () => {
		const { svg, scene } = draw(example);
		const diagram = await mount(svg, "width: 800px; height: 420px");
		const texts = scene.nodes.flatMap((node) => [
			node.title,
			...node.rows.flatMap((row) => (row.value === undefined ? [row.name] : [row.name, row.value])),
		]);

		// The browser loads the font once it's declared, and draws the text again. It
		// rounds each glyph to its own grid, which moves a text's end by under 0.1 px.
		// In the fallback fonts, even a single digit is over 0.5 px narrower.
		await expect
			.poll(() =>
				texts.map((text) => {
					const drawn = textsOf(diagram, text.text)[0] as SVGTextContentElement;
					return Math.abs(drawn.getComputedTextLength() - text.width) < 0.15;
				}),
			)
			.toEqual(texts.map(() => true));
	});

	test("is declared on the page while its Diagram is there, and no longer", async () => {
		const { svg } = draw(example);
		expect(declaredFaces()).toEqual([]);

		const first = await mount(svg, "width: 800px; height: 420px");
		const second = await mount(svg, "width: 800px; height: 420px");

		// One face for each weight the SVG draws in, however many Diagrams show it.
		expect(
			declaredFaces()
				.map((face) => face.weight)
				.sort(),
		).toEqual(["400", "600"]);

		first.remove();
		expect(declaredFaces()).toHaveLength(2);
		second.remove();
		expect(declaredFaces()).toEqual([]);
	});

	test("gives way to the font of the SVG that takes its Diagram's place", async () => {
		const diagram = await mount(draw(example).svg, "width: 800px; height: 420px");
		const before = declaredFaces().map((face) => face.family);
		const loaded = next(diagram, "load");

		const url = URL.createObjectURL(new Blob([draw(shop()).svg], { type: "image/svg+xml" }));
		diagram.setAttribute("src", url);
		await loaded;
		URL.revokeObjectURL(url);

		const after = declaredFaces().map((face) => face.family);
		expect(after).toHaveLength(1);
		expect(before).not.toContain(after[0]);
	});
});
