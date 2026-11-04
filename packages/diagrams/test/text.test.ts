import { describe, expect, test } from "vitest";
import { architecture, render, type Scene, type SceneText } from "../src/index.ts";
import { advanceOf, bundledFont, characterMap, unitsPerEm } from "./support/truetype.ts";

const interSemiBold = bundledFont("Inter-SemiBold.ttf");
const semiBoldCharacters = characterMap(interSemiBold);

function sceneOf(diagram: unknown): Scene {
	const { scene } = render(diagram);
	if (scene === undefined) {
		throw new Error("expected a scene");
	}
	return scene;
}

/** The scene text of each title, for one Node per title. */
function titlesOf(...titles: string[]): SceneText[] {
	const scene = sceneOf(
		architecture({ title: "Titles" }, (d) => {
			titles.forEach((title, index) => {
				d.node({ id: `node-${index}`, kind: "service", title });
			});
		}),
	);
	return scene.nodes.map((node) => node.title);
}

/** A text's width in Inter SemiBold, read from the font file: its characters' advance widths, summed. */
function widthInInterSemiBold(text: string, size: number): number {
	let units = 0;
	for (const character of text) {
		const glyph = semiBoldCharacters.get(character.codePointAt(0) ?? 0);
		if (glyph === undefined) {
			throw new Error(`Inter SemiBold has no ${character}`);
		}
		units += advanceOf(interSemiBold, glyph);
	}
	return (units * size) / unitsPerEm(interSemiBold);
}

describe("measuring text", () => {
	test("measures titles in Inter SemiBold, as their characters' advance widths summed, ignoring kerning and ligatures", () => {
		// Kerning would narrow `AV`, `Ty` and `To`, and ligatures would join `fi` and `->`.
		const texts = ["Orders API", "AVATAR", "Typography", "Top office", "a -> b"];
		const titles = titlesOf(...texts);
		titles.forEach((title, index) => {
			const text = texts[index] ?? "";
			expect(title.text).toBe(text);
			expect(title.shortened).toBe(false);
			expect(title.weight).toBe("semibold");
			expect(title.size).toBeGreaterThan(0);
			expect(title.width).toBeCloseTo(widthInInterSemiBold(text, title.size), 9);
		});
	});
});

describe("shortening titles", () => {
	const tooWide = [
		"Internationalization service",
		"Customer notification preferences",
		"Warehouse inventory reconciliation",
	];

	test("shortens a title too wide for its Node with an ellipsis, keeping as much of it as fits", () => {
		for (const full of tooWide) {
			const [title] = titlesOf(full);
			expect(title?.shortened, full).toBe(true);
			expect(title?.text, full).toMatch(/\S…$/);
			const kept = title?.text.slice(0, -1) ?? "";
			expect(full.startsWith(kept), `${kept} starts ${full}`).toBe(true);

			// One more word character, with any space before it, no longer fits.
			const longer = kept + (full.slice(kept.length).match(/^\s*\S/)?.[0] ?? "");
			const [fits, doesNot] = titlesOf(`${kept}…`, `${longer}…`);
			expect(fits?.shortened, `${kept}… fits`).toBe(false);
			expect(doesNot?.shortened, `${longer}… doesn't fit`).toBe(true);
		}
	});

	test("draws every title inside its Node, measured at its drawn width", () => {
		const scene = sceneOf(
			architecture({ title: "Titles" }, (d) => {
				for (const [index, title] of [...tooWide, "Orders API", "W".repeat(40)].entries()) {
					d.node({ id: `node-${index}`, kind: "service", title });
				}
			}),
		);
		for (const { box, title } of scene.nodes) {
			expect(title.width).toBeCloseTo(widthInInterSemiBold(title.text, title.size), 9);
			expect(title.point.x - title.width / 2, title.text).toBeGreaterThan(box.x);
			expect(title.point.x + title.width / 2, title.text).toBeLessThan(box.x + box.width);
		}
	});

	test("keeps the full title in the model, and warns, naming the Node", () => {
		const diagram = architecture({ title: "Shop" }, (d) => {
			d.node({ id: "orders-api", kind: "service", title: "Orders API" });
			d.node({ id: "translations", kind: "service", title: "Internationalization service" });
		});
		const before = structuredClone(diagram);

		const { scene, diagnostics } = render(diagram);

		expect(diagram).toEqual(before);
		const drawn = scene?.nodes[1]?.title.text;
		expect(drawn).toMatch(/^Internationaliz.*…$/);
		expect(diagnostics).toEqual([
			{
				severity: "warning",
				rule: "text-shortened",
				message: `Node \`translations\`'s title is too wide for its Node, so it's shortened to \`${drawn}\`. Choose a shorter title to show it in full.`,
				pointer: "/nodes/1/title",
			},
		]);
	});
});
