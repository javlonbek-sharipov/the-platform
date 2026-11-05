import type { PlatformDiagram } from "@the-platform/diagrams/web-component";
import { afterEach, expect, test } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { architecture, type Diagram, domain } from "../../src/index.ts";
import { draw } from "./support/drawing.ts";
import { opacityOf, textOf } from "./support/looking.ts";
import { frame, mount } from "./support/page.ts";

function checkout() {
	return architecture({ id: "checkout", title: "Checkout" }, (d) => {
		const api = d.node({ id: "api", kind: "service", title: "Checkout API" });
		const db = d.node({ id: "db", kind: "database", title: "Orders" });
		const payment = d.node({ id: "payment", kind: "service", title: "Payments" });
		d.node({ id: "aside", kind: "worker", title: "Unrelated" });
		const save = d.edge(api, db, { id: "save", kind: "call", label: "Save" });
		const charge = d.edge(api, payment, { id: "charge", kind: "call", label: "Charge" });
		d.walkthrough({
			id: "place-order",
			title: "Place an order",
			steps: [
				{ edges: [save], note: "Save the order." },
				{ edges: [{ edge: save, back: true }], note: "Return its id." },
				{ edges: [save, charge], note: "Save and charge together." },
				{ node: api, note: "Checkout complete." },
			],
		});
		d.walkthrough({
			id: "charge-order",
			title: "Charge an order",
			steps: [{ edges: [charge], note: "Charge once." }],
		});
	});
}

function contexts() {
	return domain({ id: "contexts", title: "Context steps" }, (d) => {
		const catalog = d.node({ id: "catalog", kind: "context", title: "Catalog" });
		const orders = d.node({ id: "orders", kind: "context", title: "Ordering" });
		const shipping = d.node({ id: "shipping", kind: "context", title: "Shipping" });
		const products = d.edge(catalog, orders, {
			id: "save",
			kind: "upstream-downstream",
			label: "Products",
			roles: { from: ["OHS"], to: ["CF"] },
		});
		const partner = d.edge(orders, shipping, { id: "charge", kind: "partnership" });
		d.walkthrough({
			id: "place-order",
			title: "Place an order",
			steps: [
				{ edges: [products], note: "Products arrive." },
				{ edges: [{ edge: products, back: true }], note: "Explain backwards." },
				{ edges: [products, partner] },
				{ node: orders },
			],
		});
	});
}

async function setup(model: Diagram = checkout()) {
	const host = (await mount(draw(model).svg, "width: 1000px; height: 500px")) as PlatformDiagram;
	return { host, ui: page.elementLocator(host) };
}

test("lists Walkthroughs by title and steps forward and back with notes and exact highlights", async () => {
	const { host, ui } = await setup();
	expect(
		ui
			.getByRole("list", { name: "Walkthroughs" })
			.getByRole("button")
			.elements()
			.map((button) => button.textContent),
	).toEqual(["Place an order", "Charge an order"]);
	await ui.getByRole("button", { name: "Place an order" }).click();
	const controls = ui.getByRole("region", { name: "Walkthrough" });
	await expect.element(controls.getByRole("status")).toHaveTextContent("Step 1 of 4");
	await expect.element(controls.getByText("Save the order.")).toBeVisible();
	await expect.poll(() => opacityOf(textOf(host, "Unrelated"))).toBe(0.2);
	expect(opacityOf(textOf(host, "Orders"))).toBe(1);
	expect(opacityOf(textOf(host, "Payments"))).toBe(0.2);
	await controls.getByRole("button", { name: "Next Step" }).click();
	await expect
		.element(controls.getByRole("status"), { timeout: 500 })
		.toHaveTextContent("Step 2 of 4");
	await expect.element(controls.getByText("Return its id.")).toBeVisible();
	await controls.getByRole("button", { name: "Next Step" }).click();
	await expect.element(controls.getByText("Save and charge together.")).toBeVisible();
	await expect.poll(() => opacityOf(textOf(host, "Payments"))).toBe(1);
	await controls.getByRole("button", { name: "Next Step" }).click();
	await expect.element(controls.getByText("Checkout complete.")).toBeVisible();
	await expect.poll(() => opacityOf(textOf(host, "Orders"))).toBe(0.2);
	expect(opacityOf(textOf(host, "Checkout API"))).toBe(1);
	await expect.element(controls.getByRole("button", { name: "Next Step" })).toBeDisabled();
	await controls.getByRole("button", { name: "Previous Step" }).click();
	await expect.element(controls.getByRole("status")).toHaveTextContent("Step 3 of 4");
});

function marks(host: Element): SVGCircleElement[] {
	return [
		...(host.shadowRoot?.querySelectorAll<SVGCircleElement>("[data-walkthrough-edge]") ?? []),
	];
}

afterEach(async () => {
	await cdp().send("Emulation.setEmulatedMedia", { features: [] });
});

test("highlights fade smoothly, then reduced motion and host motion-off make Steps instant", async () => {
	const { host, ui } = await setup();
	await ui.getByRole("button", { name: "Place an order" }).click();
	const root = host.shadowRoot;
	if (root === null) throw new Error("Diagram missing its shadow root");
	const controls = ui.getByRole("region", { name: "Walkthrough" });
	const mark = marks(host)[0];
	if (mark === undefined) throw new Error("Step missing its mark");
	const before = mark.getBoundingClientRect().x;
	await frame();
	expect(mark.getBoundingClientRect().x).toBeGreaterThan(before);
	expect(root.getAnimations().length).toBeGreaterThan(0);
	// Reading only the document would miss the motion actually being rendered.
	expect(document.getAnimations()).toEqual([]);
	await expect.poll(() => opacityOf(textOf(host, "Payments"))).toBe(0.2);
	await controls.getByRole("button", { name: "Next Step" }).click();
	await controls.getByRole("button", { name: "Next Step" }).click();
	await frame();
	expect(opacityOf(textOf(host, "Payments"))).toBeGreaterThan(0.2);
	expect(opacityOf(textOf(host, "Payments"))).toBeLessThan(1);
	await expect.poll(() => opacityOf(textOf(host, "Payments"))).toBe(1);
	await controls.getByRole("button", { name: "Play" }).click();
	await cdp().send("Emulation.setEmulatedMedia", {
		features: [{ name: "prefers-reduced-motion", value: "reduce" }],
	});
	await frame();
	expect(root.getAnimations()).toEqual([]);
	const still = marks(host).map((mark) => mark.getBoundingClientRect().x);
	await frame();
	expect(marks(host).map((mark) => mark.getBoundingClientRect().x)).toEqual(still);
	await controls.getByRole("button", { name: "Next Step" }).click();
	expect(opacityOf(textOf(host, "Payments"))).toBe(0.2);
	expect(opacityOf(textOf(host, "Orders"))).toBe(0.2);
	expect(root.getAnimations()).toEqual([]);
	await controls.getByRole("button", { name: "Previous Step" }).click();
	expect(opacityOf(textOf(host, "Payments"))).toBe(1);
	expect(root.getAnimations()).toEqual([]);
	await cdp().send("Emulation.setEmulatedMedia", { features: [] });
	await controls.getByRole("button", { name: "Play" }).click();
	await frame();
	expect(root.getAnimations().length).toBeGreaterThan(0);
	host.motion = "off";
	await frame();
	expect(root.getAnimations()).toEqual([]);
	await controls.getByRole("button", { name: "Next Step" }).click();
	expect(opacityOf(textOf(host, "Payments"))).toBe(0.2);
	expect(root.getAnimations()).toEqual([]);
	await controls.getByRole("button", { name: "Previous Step" }).click();
	await controls.getByRole("button", { name: "Play" }).click();
	expect(root.getAnimations()).toEqual([]);
	host.motion = "auto";
	await frame();
	expect(root.getAnimations().length).toBeGreaterThan(0);
});

test("Play advances automatically, Pause stops advancement, and the final Step can be replayed", async () => {
	const model = architecture({ title: "Playback" }, (d) => {
		d.node({ id: "api", kind: "service", title: "API" });
		d.node({ id: "db", kind: "database", title: "Database" });
		d.walkthrough({
			id: "explain",
			title: "Explain",
			steps: [
				{ node: "api", note: "First" },
				{ node: "db", note: "Last" },
			],
		});
	});
	const { ui } = await setup(model);
	await ui.getByRole("button", { name: "Explain" }).click();
	const controls = ui.getByRole("region", { name: "Walkthrough" });
	await controls.getByRole("button", { name: "Pause" }).click();
	await new Promise((resolve) => setTimeout(resolve, 2700));
	await expect
		.element(controls.getByRole("status"), { timeout: 500 })
		.toHaveTextContent("Step 1 of 2");
	await controls.getByRole("button", { name: "Play" }).click();
	await expect
		.element(controls.getByRole("status"), { timeout: 3200 })
		.toHaveTextContent("Step 2 of 2");
	await controls.getByRole("button", { name: "Pause" }).click();
	await controls.getByRole("button", { name: "Play" }).click();
	await expect
		.element(controls.getByRole("status"), { timeout: 500 })
		.toHaveTextContent("Step 2 of 2");
	await expect
		.element(controls.getByRole("button", { name: "Play" }), { timeout: 3200 })
		.toBeVisible();
	await controls.getByRole("button", { name: "Play" }).click();
	await expect
		.element(controls.getByRole("status"), { timeout: 500 })
		.toHaveTextContent("Step 1 of 2");
}, 15000);

test.each(["architecture", "domain"] as const)(
	"%s Steps send marks forward, back and in parallel, and pause their motion",
	async (notation) => {
		const { host, ui } = await setup(notation === "architecture" ? checkout() : contexts());
		await ui.getByRole("button", { name: "Place an order" }).click();
		const controls = ui.getByRole("region", { name: "Walkthrough" });
		expect(marks(host)).toHaveLength(1);
		const forward = marks(host)[0];
		if (forward === undefined) throw new Error("Step's mark missing");
		expect(forward.checkVisibility()).toBe(true);
		const start = forward.getBoundingClientRect().x;
		await frame();
		expect(forward.getBoundingClientRect().x).toBeGreaterThan(start);
		await controls.getByRole("button", { name: "Next Step" }).click();
		const back = marks(host)[0];
		if (back === undefined) throw new Error("Back Step's mark missing");
		expect(back.getBoundingClientRect().x).toBeGreaterThan(start + 40);
		const path = host.shadowRoot?.querySelector<SVGPathElement>('[data-edge="save"] path');
		const matrix = path?.getScreenCTM();
		if (path === null || path === undefined || matrix === null || matrix === undefined)
			throw new Error("Edge path missing");
		const target = path.getPointAtLength(0).matrixTransform(matrix);
		const box = back.getBoundingClientRect();
		expect(box.x + box.width / 2).toBeCloseTo(target.x, 1);
		expect(box.y + box.height / 2).toBeCloseTo(target.y, 1);
		await controls.getByRole("button", { name: "Play" }).click();
		const reverse = marks(host)[0];
		if (reverse === undefined) throw new Error("Back Step's mark missing");
		const returned = reverse.getBoundingClientRect().x;
		await frame();
		expect(reverse.getBoundingClientRect().x).toBeLessThan(returned);
		await controls.getByRole("button", { name: "Pause" }).click();
		await frame();
		const stopped = reverse.getBoundingClientRect().x;
		await frame();
		expect(reverse.getBoundingClientRect().x).toBe(stopped);
		await controls.getByRole("button", { name: "Next Step" }).click();
		expect(marks(host).map((mark) => mark.dataset.walkthroughEdge)).toEqual(["save", "charge"]);
		await controls.getByRole("button", { name: "Play" }).click();
		const parallel = marks(host);
		const offsets = parallel.map((mark) =>
			Number.parseFloat(getComputedStyle(mark).offsetDistance),
		);
		await frame();
		expect(
			parallel.map(
				(mark, i) => Number.parseFloat(getComputedStyle(mark).offsetDistance) < (offsets[i] ?? 0),
			),
		).toEqual([true, true]);
		await controls.getByRole("button", { name: "Next Step" }).click();
		expect(marks(host)).toEqual([]);
		if (notation === "domain") {
			await expect.poll(() => opacityOf(textOf(host, "Products"))).toBe(0.2);
			expect(opacityOf(textOf(host, "OHS"))).toBe(0.2);
			expect(opacityOf(textOf(host, "CF"))).toBe(0.2);
			expect(opacityOf(textOf(host, "Ordering"))).toBe(1);
		}
	},
);

test("arrows step while open, Escape restores selection and focus, then spatial navigation works", async () => {
	const { host, ui } = await setup();
	host.selectNode("aside");
	const selected: unknown[] = [];
	host.addEventListener("diagram-select", (event) => selected.push((event as CustomEvent).detail));
	await ui.getByRole("button", { name: "Place an order" }).click();
	const controls = ui.getByRole("region", { name: "Walkthrough" });
	const controlElement = controls.element();
	await userEvent.keyboard("{ArrowRight}{ArrowDown}{ArrowLeft}{ArrowUp}");
	await expect.element(controls.getByRole("status")).toHaveTextContent("Step 1 of 4");
	await userEvent.keyboard("{ArrowUp}");
	await expect.element(controls.getByRole("status")).toHaveTextContent("Step 1 of 4");
	await userEvent.keyboard("{ArrowRight}");
	await expect.element(controls.getByRole("status")).toHaveTextContent("Step 2 of 4");
	expect(host.selectedNode).toBe("aside");
	expect(selected).toEqual([]);
	await userEvent.keyboard("{Escape}");
	await expect.element(controlElement).not.toBeVisible();
	expect(ui.getByRole("button", { name: "Place an order" }).element().matches(":focus")).toBe(true);
	await expect.poll(() => opacityOf(textOf(host, "Unrelated"))).toBe(1);
	expect(host.selectedNode).toBe("aside");
	expect(selected).toEqual([]);
	host.selectNode("api");
	// Enter the drawing on empty space; a Node click now opens its details.
	await userEvent.click(host, { position: { x: 4, y: 4 } });
	await userEvent.keyboard("{ArrowRight}");
	expect(host.selectedNode).not.toBe("api");
});

test("SVG replacement and disconnect end playback, preserve selection and clean up old marks and timers", async () => {
	const { host, ui } = await setup();
	host.selectNode("aside");
	const heard: unknown[] = [];
	host.addEventListener("diagram-select", (event) => heard.push((event as CustomEvent).detail));
	await ui.getByRole("button", { name: "Place an order" }).click();
	const old = host.shadowRoot?.querySelector("svg");
	expect(old?.querySelectorAll("[data-walkthrough-edge]")).toHaveLength(1);
	host.motion = "off";
	host.innerHTML = draw({ ...checkout(), direction: "down" }).svg;
	await frame();
	expect(host.selectedNode).toBe("aside");
	expect(heard).toEqual([]);
	expect(old?.querySelectorAll("[data-walkthrough-edge]")).toHaveLength(0);
	expect(host.shadowRoot?.getAnimations()).toEqual([]);
	expect(ui.getByRole("list", { name: "Walkthroughs" }).elements()).toHaveLength(1);
	expect(ui.getByRole("region", { name: "Walkthrough" }).elements()).toHaveLength(0);
	expect(opacityOf(textOf(host, "Unrelated"))).toBe(1);
	host.motion = "auto";
	await ui.getByRole("button", { name: "Place an order" }).click();
	const status = ui.getByRole("region", { name: "Walkthrough" }).getByRole("status").element();
	const parent = host.parentElement;
	if (parent === null) throw new Error("Diagram is detached");
	host.remove();
	expect(marks(host)).toEqual([]);
	parent.append(host);
	await frame();
	expect(host.selectedNode).toBe("aside");
	expect(ui.getByRole("list", { name: "Walkthroughs" }).elements()).toHaveLength(1);
	expect(ui.getByRole("region", { name: "Walkthrough" }).elements()).toHaveLength(0);
	await new Promise((resolve) => setTimeout(resolve, 2700));
	expect(status.textContent).toBe("Step 1 of 4");
	expect(opacityOf(textOf(host, "Unrelated"))).toBe(1);
	expect(heard).toEqual([]);
});

test("leaving a Walkthrough restores explicit host emphasis and respects a newer host override", async () => {
	const { host, ui } = await setup();
	host.selectNode("api");
	host.setHighlight({ nodes: ["aside"] });
	await ui.getByRole("button", { name: "Place an order" }).click();
	await userEvent.keyboard("{Escape}");
	await expect.poll(() => opacityOf(textOf(host, "Unrelated"))).toBe(1);
	await expect.poll(() => opacityOf(textOf(host, "Checkout API"))).toBe(0.2);
	await ui.getByRole("button", { name: "Place an order" }).click();
	host.setHighlight({ nodes: ["db"] });
	await userEvent.keyboard("{Escape}");
	await expect.poll(() => opacityOf(textOf(host, "Orders"))).toBe(1);
	await expect.poll(() => opacityOf(textOf(host, "Unrelated"))).toBe(0.2);
	expect(host.selectedNode).toBe("api");
});

test("a Step's moving marks pause off screen and resume when the Diagram is visible", async () => {
	const { host, ui } = await setup();
	await ui.getByRole("button", { name: "Place an order" }).click();
	const mark = marks(host)[0];
	const motion = mark?.getAnimations()[0];
	if (motion === undefined) throw new Error("Step's motion is missing");
	expect(motion.playState).toBe("running");
	host.style.transform = "translateY(2000px)";
	await expect.poll(() => motion.playState).toBe("paused");
	await motion.ready;
	const time = motion.currentTime;
	await frame();
	expect(motion.currentTime).toBe(time);
	host.style.transform = "";
	await expect.poll(() => motion.playState).toBe("running");
	await frame();
	expect(motion.currentTime).not.toBe(time);
});

test("Walkthrough keyboard handling leaves a host's prevented keys available to other parts", async () => {
	const { host, ui } = await setup();
	await ui.getByRole("button", { name: "Place an order" }).click();
	const controls = ui.getByRole("region", { name: "Walkthrough" });
	const handled = (event: KeyboardEvent) => {
		if (event.key === "ArrowRight") event.preventDefault();
	};
	host.addEventListener("keydown", handled, { capture: true });
	await userEvent.keyboard("{ArrowRight}");
	await expect
		.element(controls.getByRole("status"), { timeout: 500 })
		.toHaveTextContent("Step 1 of 4");
	host.removeEventListener("keydown", handled, { capture: true });
	await userEvent.keyboard("{ArrowRight}");
	await expect
		.element(controls.getByRole("status"), { timeout: 500 })
		.toHaveTextContent("Step 2 of 4");
});
