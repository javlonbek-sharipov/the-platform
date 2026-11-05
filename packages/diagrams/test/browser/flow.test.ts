import { afterEach, describe, expect, test } from "vitest";
import { cdp, userEvent } from "vitest/browser";
import example from "../../docs/example-system.diagram.ts";
import { architecture } from "../../src/index.ts";
import type { PlatformDiagram } from "../../src/web-component/index.ts";
import { draw } from "./support/drawing.ts";
import { drag } from "./support/input.ts";
import { isSeen, viewOf } from "./support/looking.ts";
import { frame, mount, place, show } from "./support/page.ts";

const calls = architecture({ title: "Calls" }, (d) => {
	const a = d.node({ id: "a", kind: "service", title: "A" });
	const b = d.node({ id: "b", kind: "service", title: "B" });
	const c = d.node({ id: "c", kind: "worker", title: "C" });
	d.edge(a, b, { kind: "call" });
	d.edge(b, c, { kind: "message" });
});

function svgOf(host: Element): SVGSVGElement {
	const svg = host.shadowRoot?.querySelector("svg");
	if (!(svg instanceof SVGSVGElement)) {
		throw new Error("the component has no drawing");
	}
	return svg;
}

function marksOf(svg: SVGSVGElement): SVGPathElement[] {
	return [...svg.querySelectorAll<SVGPathElement>("[data-flow]")];
}

/** Read the actual rendered subtree: document.getAnimations() misses shadow roots. */
function animationsOf(svg: SVGSVGElement): Animation[] {
	return svg.getAnimations({ subtree: true });
}

function offsetsOf(svg: SVGSVGElement): string[] {
	return marksOf(svg).map((mark) => getComputedStyle(mark).strokeDashoffset);
}

async function preferMotion(value: "reduce" | "no-preference"): Promise<void> {
	await cdp().send("Emulation.setEmulatedMedia", {
		features: [{ name: "prefers-reduced-motion", value }],
	});
	await frame();
}

afterEach(async () => {
	await cdp().send("Emulation.setEmulatedMedia", { features: [] });
});

describe("rendered flow", () => {
	test("moves toward the target in the standalone SVG, then stops for reduced motion", async () => {
		const holder = place(document.createElement("div"));
		holder.innerHTML = draw(calls).svg;
		const svg = holder.querySelector("svg") as SVGSVGElement;
		await frame();

		expect(animationsOf(svg)).toHaveLength(2);
		const [mark] = marksOf(svg);
		if (mark === undefined) {
			throw new Error("the drawing has no flow marks");
		}
		// The stroke runs back from the target, so a growing dash offset moves
		// its marks toward the target, along both solid and dashed Edges.
		expect(mark.getPointAtLength(0).x).toBeGreaterThan(
			mark.getPointAtLength(mark.getTotalLength()).x,
		);
		const before = offsetsOf(svg).map(Number.parseFloat);
		await frame();
		expect(offsetsOf(svg).map((offset, i) => Number.parseFloat(offset) > (before[i] ?? 0))).toEqual(
			[true, true],
		);

		await preferMotion("reduce");
		expect(animationsOf(svg)).toEqual([]);
		const still = offsetsOf(svg);
		await frame();
		expect(offsetsOf(svg)).toEqual(still);
	});

	test("stops the animations inside the shadow root when reduced motion changes", async () => {
		const host = await mount(draw(calls).svg, "width: 900px; height: 240px");
		const svg = svgOf(host);
		expect(animationsOf(svg)).toHaveLength(2);
		// This is empty even with motion running, so it cannot prove stillness.
		expect(document.getAnimations()).toEqual([]);
		const moving = offsetsOf(svg);
		await frame();
		expect(offsetsOf(svg)).not.toEqual(moving);

		await preferMotion("reduce");
		expect(host.shadowRoot?.getAnimations()).toEqual([]);
		expect(animationsOf(svg)).toEqual([]);
		const still = offsetsOf(svg);
		await frame();
		expect(offsetsOf(svg)).toEqual(still);

		await preferMotion("no-preference");
		expect(animationsOf(svg)).toHaveLength(2);
		await frame();
		expect(offsetsOf(svg)).not.toEqual(still);
	});

	test("lets the host turn motion off and back on", async () => {
		const host = (await mount(draw(calls).svg, "width: 900px; height: 240px")) as PlatformDiagram;
		const svg = svgOf(host);
		expect(animationsOf(svg)).toHaveLength(2);

		host.motion = "off";
		await frame();
		expect(host.getAttribute("motion")).toBe("off");
		expect(animationsOf(svg)).toEqual([]);
		const still = offsetsOf(svg);
		await frame();
		expect(offsetsOf(svg)).toEqual(still);

		host.motion = "auto";
		await frame();
		expect(animationsOf(svg)).toHaveLength(2);
		await preferMotion("reduce");
		expect(animationsOf(svg)).toEqual([]);
	});

	test("honors motion-off in HTML before the SVG is shown, independently for each component", async () => {
		const drawing = draw(calls).svg;
		const off = (await show(
			`<platform-diagram motion="off" style="width: 900px; height: 240px">${drawing}</platform-diagram>`,
		)) as PlatformDiagram;
		const on = await mount(drawing, "width: 900px; height: 240px");
		expect(off.motion).toBe("off");
		expect(animationsOf(svgOf(off))).toEqual([]);
		expect(marksOf(svgOf(off)).some(isSeen)).toBe(false);
		expect(animationsOf(svgOf(on)).map((animation) => animation.playState)).toEqual([
			"running",
			"running",
		]);

		off.removeAttribute("motion");
		await frame();
		expect(off.motion).toBe("auto");
		expect(animationsOf(svgOf(off))).toHaveLength(2);
	});

	test("starts still when reduced motion is already requested, and keeps a replacement SVG still", async () => {
		await preferMotion("reduce");
		const host = await mount(draw(calls).svg, "width: 900px; height: 240px");
		const old = svgOf(host);
		expect(animationsOf(old)).toEqual([]);
		expect(marksOf(old).some(isSeen)).toBe(false);

		host.insertAdjacentHTML("beforeend", draw(example).svg);
		await frame();
		const replacement = svgOf(host);
		expect(replacement).not.toBe(old);
		expect(animationsOf(replacement)).toEqual([]);
		await preferMotion("no-preference");
		expect(animationsOf(replacement).length).toBeGreaterThan(0);
		expect(animationsOf(old)).toEqual([]);
	});

	test("drops flow further out than the Rows, and brings it back when the reader fits the view", async () => {
		const { svg: drawing, scene } = draw(example);
		const host = await mount(drawing, "width: 800px; height: 420px");
		const svg = svgOf(host);
		expect(marksOf(svg).some(isSeen)).toBe(true);
		await userEvent.click(host);

		await userEvent.keyboard("--------");
		await frame();
		expect(viewOf(host, scene).scale).toBeLessThan(0.35);
		expect(marksOf(svg).some(isSeen)).toBe(false);
		expect(animationsOf(svg)).toEqual([]);

		await userEvent.keyboard("0");
		await frame();
		expect(marksOf(svg).some(isSeen)).toBe(true);
		expect(animationsOf(svg).length).toBeGreaterThan(0);
	});

	test("skips Edges outside the view and changes which Edges move as the reader pans", async () => {
		const host = await mount(draw(calls).svg, "width: 320px; height: 240px");
		const svg = svgOf(host);
		const marks = marksOf(svg);
		expect(marks).toHaveLength(2);
		expect(marks.map(isSeen)).toEqual([true, false]);
		expect(animationsOf(svg)).toHaveLength(1);

		await drag(host, { x: 280, y: 120 }, { x: 20, y: 120 });
		await frame();
		expect(marks.map(isSeen)).toEqual([false, true]);
		expect(animationsOf(svg)).toHaveLength(1);

		await userEvent.keyboard("0");
		await frame();
		expect(marks.map(isSeen)).toEqual([true, false]);

		host.style.width = "900px";
		await frame();
		expect(marks.map(isSeen)).toEqual([true, true]);
		expect(animationsOf(svg)).toHaveLength(2);
	});

	test("pauses off screen without advancing, and resumes when the component comes back", async () => {
		const host = await mount(draw(calls).svg, "width: 900px; height: 240px");
		const svg = svgOf(host);
		const spacer = place(document.createElement("div"));
		spacer.style.height = "2000px";
		expect(animationsOf(svg).map((animation) => animation.playState)).toEqual([
			"running",
			"running",
		]);

		window.scrollTo(0, 1500);
		await expect.element(host).not.toBeInViewport();
		await expect
			.poll(() => animationsOf(svg).map((animation) => animation.playState))
			.toEqual(["paused", "paused"]);
		await Promise.all(animationsOf(svg).map((animation) => animation.ready));
		const times = animationsOf(svg).map((animation) => animation.currentTime);
		const offsets = offsetsOf(svg);
		await frame();
		expect(animationsOf(svg).map((animation) => animation.currentTime)).toEqual(times);
		expect(offsetsOf(svg)).toEqual(offsets);

		window.scrollTo(0, 0);
		await expect.element(host).toBeInViewport();
		await expect
			.poll(() => animationsOf(svg).map((animation) => animation.playState))
			.toEqual(["running", "running"]);
		await frame();
		expect(offsetsOf(svg)).not.toEqual(offsets);
	});

	test("skips a loop outside the view even when its bounding box covers the view", async () => {
		const loop = architecture({ title: "Loop" }, (d) => {
			const a = d.node({ id: "a", kind: "service", title: "A" });
			d.edge(a, a, { kind: "call" });
		});
		const host = await mount(draw(loop).svg, "width: 240px; height: 128px");
		const svg = svgOf(host);
		const [mark] = marksOf(svg);
		expect(animationsOf(svg)).toHaveLength(1);
		await userEvent.tab();
		await userEvent.keyboard("++++++++");
		await frame();
		// The reader is looking closely at the Node, inside its self-loop.
		expect(mark).toBeDefined();
		expect(mark && isSeen(mark)).toBe(false);
		expect(animationsOf(svg)).toEqual([]);

		await userEvent.keyboard("0");
		await frame();
		expect(mark && isSeen(mark)).toBe(true);
		expect(animationsOf(svg)).toHaveLength(1);
	});

	test("starts paused below the fold and follows a removed component when it is shown again", async () => {
		const host = await show(
			`<div style="height: 1600px"></div>
			<platform-diagram style="width: 900px; height: 240px">${draw(calls).svg}</platform-diagram>`,
		);
		const svg = svgOf(host);
		expect(animationsOf(svg).map((animation) => animation.playState)).toEqual(["paused", "paused"]);
		host.remove();
		place(host);
		host.scrollIntoView();
		await frame();
		await expect
			.poll(() => animationsOf(svg).map((animation) => animation.playState))
			.toEqual(["running", "running"]);
	});
});
