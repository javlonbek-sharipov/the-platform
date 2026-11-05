import { afterEach, expect, test } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { architecture } from "../../src/index.ts";
import type { PlatformDiagram } from "../../src/web-component/index.ts";
import { draw } from "./support/drawing.ts";
import { opacityOf } from "./support/looking.ts";
import { frame, mount } from "./support/page.ts";

function shop(after = false) {
	return architecture(
		{ id: "docs/shop", title: "Shop", direction: after ? "down" : "right" },
		(d) => {
			d.group({ id: "backend", kind: "system", title: "Backend" }, (g) => {
				const a = g.node({ id: "a", kind: "service", title: "A" });
				const b = g.node({ id: "b", kind: "service", title: "B" });
				g.edge(a, b, { id: "call", kind: "call" });
			});
			d.node({
				id: after ? "added" : "removed",
				kind: "service",
				title: after ? "Added" : "Removed",
			});
		},
	);
}

function svgOf(host: Element): SVGSVGElement {
	const svg = host.shadowRoot?.querySelector("svg");
	if (!(svg instanceof SVGSVGElement)) throw new Error("No Diagram is shown.");
	return svg;
}

function nodeOf(svg: SVGSVGElement, id: string): SVGGElement {
	const node = [...svg.querySelectorAll<SVGGElement>("[data-node], [data-group]")].find(
		(node) => node.dataset.node === id || node.dataset.group === id,
	);
	if (node === undefined) throw new Error(`No Node or Group ${id}.`);
	return node;
}

/** Actual visible geometry in drawing units, including CSS/WAAPI transforms. */
function drawnBox(svg: SVGSVGElement, node: SVGGElement) {
	const screen = node.getScreenCTM();
	const drawing = svg.getScreenCTM();
	if (screen === null || drawing === null) throw new Error("The drawing isn't on screen.");
	const matrix = drawing.inverse().multiply(screen);
	const box = node.getBBox();
	const point = new DOMPoint(box.x, box.y).matrixTransform(matrix);
	return { x: point.x, y: point.y, width: box.width * matrix.a, height: box.height * matrix.d };
}

async function settled(host: Element): Promise<void> {
	await expect
		.poll(
			() =>
				svgOf(host)
					.getAnimations({ subtree: true })
					.filter(
						(animation) => animation instanceof Animation && !(animation instanceof CSSAnimation),
					).length,
			{ timeout: 1500 },
		)
		.toBe(0);
	await frame();
}

afterEach(async () => {
	await cdp().send("Emulation.setEmulatedMedia", { features: [] });
});

test("the same Diagram glides existing Nodes and Groups to fresh geometry and removes retired Nodes", async () => {
	const before = draw(shop());
	const after = draw(shop(true));
	const host = await mount(before.svg, "width: 1100px; height: 600px");
	const old = svgOf(host);
	const b = nodeOf(old, "b");
	const group = nodeOf(old, "backend");
	const removed = nodeOf(old, "removed");
	const start = drawnBox(old, b);
	host.insertAdjacentHTML("beforeend", after.svg);
	await frame();
	const svg = svgOf(host);
	expect(nodeOf(svg, "b")).toBe(b);
	expect(nodeOf(svg, "backend")).toBe(group);
	expect(
		svg.getAnimations({ subtree: true }).some((animation) => !(animation instanceof CSSAnimation)),
	).toBe(true);
	const destination = after.scene.nodes.find(({ id }) => id === "b")?.box;
	expect(destination).toBeDefined();
	const during = drawnBox(svg, b);
	expect(
		Math.abs(during.x - (destination?.x ?? 0)) + Math.abs(during.y - (destination?.y ?? 0)),
	).toBeGreaterThan(1);
	expect(Math.abs(during.x - start.x) + Math.abs(during.y - start.y)).toBeGreaterThan(0);
	expect(removed.isConnected).toBe(true);
	expect(opacityOf(removed)).toBeGreaterThan(0);
	expect(opacityOf(removed)).toBeLessThan(1);
	expect(opacityOf(nodeOf(svg, "added"))).toBeGreaterThan(0);
	expect(opacityOf(nodeOf(svg, "added"))).toBeLessThan(1);
	await settled(host);
	const fresh = svgOf(await mount(after.svg, "width: 1100px; height: 600px"));
	for (const { id } of after.scene.nodes) {
		const actual = drawnBox(svg, nodeOf(svg, id));
		const expected = nodeOf(fresh, id).getBBox();
		expect(actual.x).toBeCloseTo(expected.x, 2);
		expect(actual.y).toBeCloseTo(expected.y, 2);
	}
	expect(removed.isConnected).toBe(false);
	expect(svg.querySelector('[data-node="removed"]')).toBeNull();
});

test("a Group with a moving rank glides with its Nodes", async () => {
	const drawing = (down: boolean) =>
		draw(
			architecture(
				{ id: "docs/groups", title: "Groups", direction: down ? "down" : "right" },
				(d) => {
					d.group({ id: "one", kind: "system", title: "One" }, (g) =>
						g.node({ id: "a", kind: "service", title: "A" }),
					);
					d.group({ id: "two", kind: "system", title: "Two" }, (g) =>
						g.node({ id: "b", kind: "service", title: "B" }),
					);
					d.edge("a", "b", { kind: "call" });
				},
			),
		);
	const host = await mount(drawing(false).svg, "width: 1000px; height: 600px");
	const group = nodeOf(svgOf(host), "two");
	const start = drawnBox(svgOf(host), group);
	const next = drawing(true);
	host.insertAdjacentHTML("beforeend", next.svg);
	await frame();
	const during = drawnBox(svgOf(host), group);
	expect(during.x).not.toBe(start.x);
	expect(group.getAnimations().length).toBeGreaterThan(0);
	await settled(host);
	const expected = next.scene.groups.find(({ id }) => id === "two")?.box;
	const final = drawnBox(svgOf(host), group);
	expect(final.x).toBeCloseTo(expected?.x ?? 0, 2);
	expect(final.y).toBeCloseTo(expected?.y ?? 0, 2);
});

test.for(["host", "reduced"] as const)(
	"%s motion-off settles a moving transition and suppresses later transitions",
	async (policy) => {
		const before = draw(shop());
		const after = draw(shop(true));
		const host = (await mount(before.svg, "width: 1100px; height: 600px")) as PlatformDiagram;
		const start = drawnBox(svgOf(host), nodeOf(svgOf(host), "b"));
		host.insertAdjacentHTML("beforeend", after.svg);
		await frame();
		const moving = drawnBox(svgOf(host), nodeOf(svgOf(host), "b"));
		const animations = host.shadowRoot?.getAnimations() ?? [];
		expect(animations.some((animation) => !(animation instanceof CSSAnimation))).toBe(true);
		// A positive shadow-root baseline shows why the document alone is insufficient.
		expect(document.getAnimations()).toEqual([]);
		await frame();
		expect(drawnBox(svgOf(host), nodeOf(svgOf(host), "b"))).not.toEqual(moving);
		if (policy === "host") host.motion = "off";
		else
			await cdp().send("Emulation.setEmulatedMedia", {
				features: [{ name: "prefers-reduced-motion", value: "reduce" }],
			});
		// Let the media-query change event arrive, without waiting for the
		// transition's own duration to expire and accidentally accepting it.
		await frame();
		await frame();
		expect(host.shadowRoot?.getAnimations()).toEqual([]);
		const stopped = drawnBox(svgOf(host), nodeOf(svgOf(host), "b"));
		await frame();
		expect(drawnBox(svgOf(host), nodeOf(svgOf(host), "b"))).toEqual(stopped);
		expect(stopped.x).toBeCloseTo(56.75, 2);
		expect(stopped.y).toBeCloseTo(224.75, 2);
		host.insertAdjacentHTML("beforeend", before.svg);
		await frame();
		expect(drawnBox(svgOf(host), nodeOf(svgOf(host), "b"))).toEqual(start);
		expect(host.shadowRoot?.getAnimations()).toEqual([]);
		expect(svgOf(host).getAnimations({ subtree: true })).toEqual([]);
		expect(document.getAnimations()).toEqual([]);
	},
);

test("old routes bend with their endpoints during the glide, then give way to the exact fresh routes", async () => {
	const before = draw(shop());
	const after = draw(shop(true));
	const host = await mount(before.svg, "width: 1100px; height: 600px");
	const old = svgOf(host);
	const target = nodeOf(old, "b");
	const start = drawnBox(old, target);
	const route = old.querySelector<SVGPathElement>('[data-edge="call"] path');
	if (route === null) throw new Error("No old route.");
	const end = route.getPointAtLength(0);
	host.insertAdjacentHTML("beforeend", after.svg);
	await frame();
	const svg = svgOf(host);
	const moved = drawnBox(svg, target);
	const following = route.getPointAtLength(0);
	expect(route.isConnected).toBe(true);
	expect(Math.abs(moved.x - start.x)).toBeGreaterThan(1);
	expect(following.x - end.x).toBeCloseTo(moved.x - start.x, 0);
	expect(following.y - end.y).toBeCloseTo(moved.y - start.y, 0);
	const newRoute = svg.querySelector<SVGPathElement>('[data-edge="call"] path');
	expect(newRoute?.checkVisibility({ opacityProperty: true })).toBe(false);
	await settled(host);
	expect(route.isConnected).toBe(false);
	const fresh = new DOMParser().parseFromString(after.svg, "image/svg+xml");
	expect(newRoute?.getAttribute("d")).toBe(
		fresh.querySelector('[data-edge="call"] path')?.getAttribute("d"),
	);
	expect(newRoute?.checkVisibility({ opacityProperty: true })).toBe(true);
});

test("redrawing preserves the reader's zoom, selection and explicit highlights", async () => {
	const host = (await mount(draw(shop()).svg, "width: 400px; height: 300px")) as PlatformDiagram;
	await userEvent.click(host);
	await userEvent.keyboard("++");
	host.selectNode("a");
	host.setHighlight({ nodes: ["b"] });
	const width = svgOf(host).viewBox.baseVal.width;
	host.insertAdjacentHTML("beforeend", draw(shop(true)).svg);
	await frame();
	expect(host.selectedNode).toBe("a");
	expect(svgOf(host).viewBox.baseVal.width).toBeCloseTo(width, 5);
	await expect.poll(() => getComputedStyle(nodeOf(svgOf(host), "a")).opacity).toBe("0.2");
	expect(getComputedStyle(nodeOf(svgOf(host), "b")).opacity).toBe("1");
	await settled(host);
});

test("another redraw and disconnect cancel old transitions and leave the newest geometry", async () => {
	const host = await mount(draw(shop()).svg, "width: 1100px; height: 600px");
	host.insertAdjacentHTML("beforeend", draw(shop(true)).svg);
	await frame();
	const previous = svgOf(host)
		.getAnimations({ subtree: true })
		.filter((animation) => !(animation instanceof CSSAnimation));
	expect(previous.length).toBeGreaterThan(0);
	const latest = draw(
		architecture({ id: "docs/shop", title: "Shop" }, (d) => {
			d.node({ id: "b", kind: "service", title: "Newest B" });
		}),
	);
	host.insertAdjacentHTML("beforeend", latest.svg);
	await frame();
	expect(previous.map((animation) => animation.playState)).toEqual(previous.map(() => "idle"));
	expect(svgOf(host).getAnimations({ subtree: true }).length).toBeGreaterThan(0);
	const parent = host.parentElement;
	host.remove();
	expect(host.shadowRoot?.getAnimations()).toEqual([]);
	parent?.append(host);
	await frame();
	const svg = svgOf(host);
	expect(svg.querySelectorAll("[data-node]")).toHaveLength(1);
	expect(svg.querySelectorAll("svg")).toHaveLength(0);
	expect(drawnBox(svg, nodeOf(svg, "b"))).toEqual({
		x: 24.75,
		y: 24.75,
		width: 174.5,
		height: 46.5,
	});
	expect(host.shadowRoot?.getAnimations()).toEqual([]);
});

test.for([110, 400])(
	"an interrupted glide at %s ms keeps every visible old arrow and route attached to both moving Nodes",
	async (interruptAt) => {
		const drawing = (version: number) =>
			draw(
				architecture({ id: "docs/rapid", title: "Rapid edits" }, (d) => {
					const a = d.node({ id: "a", kind: "service", title: "Alpha" });
					const b = d.node({ id: "b", kind: "service", title: "Beta" });
					d.edge(a, b, { id: "ab", kind: "call" });
					if (version > 0) {
						const x = d.node({ id: "x", kind: "service", title: "Extra" });
						d.edge(a, x, { kind: "call" });
						d.edge(x, b, { kind: "call" });
						if (version > 1) {
							const y = d.node({ id: "y", kind: "service", title: "More" });
							d.edge(x, y, { kind: "call" });
							d.edge(y, b, { kind: "call" });
						}
					}
				}),
			);
		const host = await mount(drawing(0).svg, "width: 1100px; height: 550px");
		host.insertAdjacentHTML("beforeend", drawing(1).svg);
		await new Promise((resolve) => setTimeout(resolve, interruptAt));
		const before = drawnBox(svgOf(host), nodeOf(svgOf(host), "b"));
		host.insertAdjacentHTML("beforeend", drawing(2).svg);
		await frame();
		const svg = svgOf(host);
		const b = nodeOf(svg, "b");
		expect(Math.abs(drawnBox(svg, b).x - before.x)).toBeLessThan(80);
		const paths = [...svg.querySelectorAll<SVGPathElement>('[data-retired-edge="ab"] path')];
		const visible = (path: SVGPathElement) => {
			let opacity = 1;
			for (
				let element: Element | null = path;
				element !== null && element !== svg;
				element = element.parentElement
			)
				opacity *= Number(getComputedStyle(element).opacity);
			return opacity > 0.1;
		};
		const screenPoint = (element: SVGGraphicsElement, point: DOMPointInit) =>
			new DOMPoint(point.x, point.y).matrixTransform(element.getScreenCTM() ?? undefined);
		for (let sample = 0; sample < 4; sample += 1) {
			const targetBox = b.getBBox();
			const target = screenPoint(b, { x: targetBox.x, y: targetBox.y + targetBox.height / 2 });
			const a = nodeOf(svg, "a");
			const sourceBox = a.getBBox();
			const source = screenPoint(a, {
				x: sourceBox.x + sourceBox.width,
				y: sourceBox.y + sourceBox.height / 2,
			});
			const arrows = paths.filter(
				(path) => path.getAttribute("fill") === "currentColor" && visible(path),
			);
			const lines = paths.filter(
				(path) =>
					path.getAttribute("stroke-width") === "3.5" &&
					!path.hasAttribute("stroke-linecap") &&
					visible(path),
			);
			expect(arrows.length).toBeGreaterThan(0);
			expect(lines.length).toBeGreaterThan(0);
			for (const arrow of arrows) {
				const tip = screenPoint(arrow, arrow.getPointAtLength(0));
				expect(Math.hypot(target.x - tip.x, target.y - tip.y)).toBeLessThan(2);
			}
			for (const line of lines) {
				const start = screenPoint(line, line.getPointAtLength(line.getTotalLength()));
				expect(Math.hypot(source.x - start.x, source.y - start.y)).toBeLessThan(2);
			}
			await frame();
		}
		await settled(host);
	},
);

test("retiring text keeps its font during a transition and releases it when the transition ends", async () => {
	const host = await mount(draw(shop()).svg, "width: 1100px; height: 600px");
	const text = nodeOf(svgOf(host), "removed").querySelector("text");
	if (text === null) throw new Error("The retired Node has no title.");
	const family = getComputedStyle(text).fontFamily.split(",")[0]?.replaceAll('"', "");
	const retained = () => [...document.fonts].some((face) => face.family === family);
	expect(retained()).toBe(true);
	host.insertAdjacentHTML("beforeend", draw(shop(true)).svg);
	await frame();
	expect(retained()).toBe(true);
	await settled(host);
	expect(retained()).toBe(false);
});

test("a redraw ends Walkthrough playback, rebuilds its list and restores host emphasis", async () => {
	const drawing = (updated: boolean) =>
		draw(
			architecture(
				{ id: "docs/steps", title: "Steps", direction: updated ? "down" : "right" },
				(d) => {
					const a = d.node({ id: "a", kind: "service", title: "A" });
					const b = d.node({ id: "b", kind: "service", title: "B" });
					const edge = d.edge(a, b, { kind: "call" });
					d.walkthrough({
						id: "read",
						title: updated ? "Updated Steps" : "Read orders",
						steps: [{ edges: [edge], note: "First note" }, { node: a }],
					});
				},
			),
		);
	const host = (await mount(drawing(false).svg, "width: 1000px; height: 500px")) as PlatformDiagram;
	host.selectNode("b");
	host.setHighlight({ nodes: ["b"] });
	const component = page.elementLocator(host);
	await component.getByRole("button", { name: "Read orders" }).click();
	await expect.element(component.getByText("First note")).toBeVisible();
	const oldControl = component.getByRole("button", { name: "Pause" }).element();
	host.insertAdjacentHTML("beforeend", drawing(true).svg);
	await frame();
	expect(oldControl.isConnected).toBe(false);
	expect(host.selectedNode).toBe("b");
	await expect.element(component.getByRole("button", { name: "Updated Steps" })).toBeVisible();
	expect(component.getByRole("button", { name: "Pause" }).query()).toBeNull();
	expect(component.getByText("First note").query()).toBeNull();
	await settled(host);
	expect(getComputedStyle(nodeOf(svgOf(host), "a")).opacity).toBe("0.2");
	expect(getComputedStyle(nodeOf(svgOf(host), "b")).opacity).toBe("1");
});
