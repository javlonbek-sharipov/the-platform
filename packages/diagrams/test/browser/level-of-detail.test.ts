import { describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import example from "../../docs/example-system.diagram.ts";
import { draw } from "./support/drawing.ts";
import { wheel } from "./support/input.ts";
import { isSeen, opacityOf, textOf, textsOf, viewOf } from "./support/looking.ts";
import { frame, mount } from "./support/page.ts";

/** The example's Rows: each text of a Row's name or value. */
function rowTextsOf(diagram: Element): Element[] {
	return ["replicas", "region", "eu-west-1", "order-placed", "order-cancelled", "2", "3"].flatMap(
		(text) => textsOf(diagram, text),
	);
}

/** The titles in the example's headers: a Node's, a Node's with a Technology, and a Group's. */
function headerTextsOf(diagram: Element): Element[] {
	return ["Orders database", "Orders API", "Go", "EU West"].map((text) => textOf(diagram, text));
}

/** Zooms a little at a time, as a pinch on a trackpad does, and says how strongly the Rows show after each step. */
async function zoomInSteps(diagram: Element, steps: number, turn: number): Promise<number[]> {
	const strengths: number[] = [];
	for (let step = 0; step < steps; step += 1) {
		await wheel(diagram, { x: 400, y: 210 }, turn, "Control");
		await frame();
		const [first = 0, ...rest] = rowTextsOf(diagram).map(opacityOf);
		// Every Row shows as strongly as every other.
		expect(rest.every((opacity) => opacity === first)).toBe(true);
		strengths.push(first);
	}
	return strengths;
}

describe("Rows", () => {
	test("show in full at the scale Fit chooses", async () => {
		const diagram = await mount(draw(example).svg, "width: 800px; height: 420px");

		const rows = rowTextsOf(diagram);
		expect(rows).toHaveLength(10);
		expect(rows.map(opacityOf)).toEqual(rows.map(() => 1));
		expect(rows.every(isSeen)).toBe(true);
	});

	test("fade as the view zooms out, and then are gone, leaving the headers", async () => {
		const { svg, scene } = draw(example);
		const diagram = await mount(svg, "width: 800px; height: 420px");

		const strengths = await zoomInSteps(diagram, 12, 10);

		// They never get stronger on the way out, and on the way they're neither whole nor gone.
		expect(strengths).toEqual([...strengths].sort((a, b) => b - a));
		expect(strengths.some((opacity) => opacity > 0 && opacity < 1)).toBe(true);
		expect(strengths.at(-1)).toBe(0);
		expect(rowTextsOf(diagram).some(isSeen)).toBe(false);
		// The whole drawing is in view by now, and its headers show as they did.
		expect(viewOf(diagram, scene).scale).toBeLessThan(0.4);
		expect(headerTextsOf(diagram).map(opacityOf)).toEqual([1, 1, 1, 1]);
		expect(headerTextsOf(diagram).every(isSeen)).toBe(true);
	});

	test("come back as the view zooms in again", async () => {
		const diagram = await mount(draw(example).svg, "width: 800px; height: 420px");
		await zoomInSteps(diagram, 12, 10);

		const strengths = await zoomInSteps(diagram, 12, -10);

		expect(strengths).toEqual([...strengths].sort((a, b) => a - b));
		expect(strengths.some((opacity) => opacity > 0 && opacity < 1)).toBe(true);
		expect(strengths.at(-1)).toBe(1);
		expect(rowTextsOf(diagram).every(isSeen)).toBe(true);
	});

	test("are gone at once when a key takes the view far off, and back when 0 fits it", async () => {
		const diagram = await mount(draw(example).svg, "width: 800px; height: 420px");
		await userEvent.tab();

		await userEvent.keyboard("-----");
		expect(rowTextsOf(diagram).some(isSeen)).toBe(false);

		await userEvent.keyboard("0");
		expect(rowTextsOf(diagram).map(opacityOf)).toEqual(rowTextsOf(diagram).map(() => 1));
	});
});
