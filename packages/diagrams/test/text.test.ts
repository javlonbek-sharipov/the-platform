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
			expect(title.weight).toBe("semibold");
			expect(title.size).toBeGreaterThan(0);
			expect(title.width).toBeCloseTo(widthInInterSemiBold(text, title.size), 9);
		});
	});
});
