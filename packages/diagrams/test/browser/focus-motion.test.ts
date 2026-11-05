import type { PlatformDiagram } from "@the-platform/diagrams/web-component";
import { afterEach, expect, test } from "vitest";
import { cdp, userEvent } from "vitest/browser";
import { architecture } from "../../src/index.ts";
import { draw } from "./support/drawing.ts";
import { moveTo } from "./support/input.ts";
import { opacityOf, textOf } from "./support/looking.ts";
import { frame, mount } from "./support/page.ts";

afterEach(async () => {
	await cdp().send("Emulation.setEmulatedMedia", { features: [] });
});

for (const input of ["hover", "selection", "host"] as const) {
	for (const policy of ["host", "reduced"] as const) {
		test(`ordinary ${input} emphasis fades without a Walkthrough and ${policy} motion-off settles it immediately`, async () => {
			const model = architecture({ title: "Ordinary focus" }, (d) => {
				const a = d.node({ id: "a", kind: "service", title: "Alpha" });
				const b = d.node({ id: "b", kind: "service", title: "Beta" });
				d.node({ id: "c", kind: "service", title: "Gamma" });
				d.edge(a, b, { kind: "call" });
			});
			const host = (await mount(
				draw(model).svg,
				"width: 1000px; height: 500px",
			)) as PlatformDiagram;
			const root = host.shadowRoot;
			if (root === null) throw new Error("No shadow root");
			const alpha = textOf(host, "Alpha");
			const gamma = textOf(host, "Gamma");
			await moveTo(host, { x: 2, y: 2 });
			await expect.poll(() => opacityOf(gamma)).toBe(1);
			const emphasize = async (on: boolean) => {
				if (input === "hover") {
					if (on) await userEvent.hover(alpha);
					else await userEvent.unhover(alpha);
				} else if (input === "selection") host.selectNode(on ? "a" : undefined);
				else host.setHighlight(on ? { nodes: ["a", "b"] } : undefined);
			};
			await emphasize(true);
			await frame();
			expect(
				root
					.getAnimations()
					.some(
						(animation) =>
							animation instanceof CSSTransition && animation.transitionProperty === "opacity",
					),
			).toBe(true);
			expect(opacityOf(gamma)).toBeGreaterThan(0.2);
			expect(opacityOf(gamma)).toBeLessThan(1);
			// A real opacity transition is required; ambient flow alone is insufficient.
			expect(document.getAnimations()).toEqual([]);
			if (policy === "host") host.motion = "off";
			else
				await cdp().send("Emulation.setEmulatedMedia", {
					features: [{ name: "prefers-reduced-motion", value: "reduce" }],
				});
			await frame();
			expect(root.getAnimations()).toEqual([]);
			expect(opacityOf(gamma)).toBe(0.2);
			await emphasize(false);
			await frame();
			expect(opacityOf(gamma)).toBe(1);
			expect(root.getAnimations()).toEqual([]);
			await emphasize(true);
			await frame();
			expect(opacityOf(gamma)).toBe(0.2);
			expect(root.getAnimations()).toEqual([]);
		});
	}
}
