import { describe, expect, test } from "vitest";
import orderFlow from "./fixtures/edges.ts";
import { draw, linesOf, strokeOf } from "./support/drawn.ts";
import { everyFixture } from "./support/fixtures.ts";
import { colorUnder, contrast, descendants, luminance, type Theme } from "./support/svg.ts";

const themes: Theme[] = ["light", "dark"];
const fixtures = await everyFixture();

describe("an Edge's line", () => {
	test("is solid for a call and dashed for a message, in both themes", () => {
		const drawn = draw(orderFlow);
		const kinds = new Set(drawn.scene.edges.map((edge) => edge.kind));
		expect([...kinds].sort()).toEqual(["call", "message"]);
		for (const theme of themes) {
			for (const edge of drawn.scene.edges) {
				const lines = linesOf(drawn, edge, theme);
				expect(lines.length, edge.id).toBeGreaterThan(0);
				for (const line of lines) {
					const { dashes } = strokeOf(drawn, line, theme);
					expect(dashes === "none", `${edge.id}, ${theme}`).toBe(edge.kind === "call");
				}
			}
		}
	});

	test("is a body inside a wider, darker casing, which stands out from the background, in both themes", () => {
		for (const [name, diagram] of fixtures) {
			const drawn = draw(diagram);
			const { bounds } = drawn.scene;
			const corner = { x: bounds.x + 1, y: bounds.y + 1 };
			const first = descendants(drawn.root).find((element) => element.attributes.has("data-edge"));
			for (const theme of themes) {
				const background = colorUnder(drawn.root, first ?? drawn.root, corner, drawn.rules, theme);
				for (const edge of drawn.scene.edges) {
					const lines = linesOf(drawn, edge, theme);
					expect(lines, `${name}: ${edge.id}`).toHaveLength(2);
					const [casing, body] = lines.map((line) => strokeOf(drawn, line, theme));
					if (casing === undefined || body === undefined) {
						continue;
					}
					expect(casing.width, `${name}: ${edge.id}`).toBeGreaterThan(body.width + 1);
					expect(luminance(casing.color), `${name}: ${edge.id}, ${theme}`).toBeLessThan(
						luminance(body.color),
					);
					expect(casing.dashes, `${name}: ${edge.id}`).toBe(body.dashes);
					expect(
						Math.max(contrast(casing.color, background), contrast(body.color, background)),
						`${name}: ${edge.id}, ${theme}`,
					).toBeGreaterThanOrEqual(3);
				}
			}
		}
	});
});
