import { describe, expect, test } from "vitest";
import { architecture, render, type Scene, type SceneText } from "../src/index.ts";
import {
	advanceOf,
	bundledFont,
	characterMap,
	tableStart,
	unitsPerEm,
} from "./support/truetype.ts";

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

describe("white space", () => {
	test("collapses in a title as SVG renderers collapse it, so drawn text is measured text", () => {
		const { scene, diagnostics } = render(
			architecture({ title: "Spaces" }, (d) => {
				d.node({ id: "orders-api", kind: "service", title: "\n\t Orders  \r\n API " });
			}),
		);
		const title = scene?.nodes[0]?.title;
		expect(title?.text).toBe("Orders API");
		expect(title?.width).toBeCloseTo(widthInInterSemiBold("Orders API", title?.size ?? 0), 9);
		expect(diagnostics).toEqual([]);
	});
});

describe("characters the font lacks", () => {
	// Inter has none of 東, 京, ☃ and 🙂.
	test("are measured at the font's average width", () => {
		const [tokyo, east, snowman, smile, plain] = titlesOf("Tokyo東京", "東", "☃", "🙂", "Tokyo");
		// The font's own average character width, from its OS/2 table.
		const averageWidth = interSemiBold.data.getInt16(tableStart(interSemiBold, "OS/2") + 2);
		const average = (averageWidth * (east?.size ?? 0)) / unitsPerEm(interSemiBold);
		expect(average).toBeGreaterThan(0);
		for (const title of [east, snowman, smile]) {
			expect(title?.width).toBeCloseTo(average, 9);
		}
		expect(tokyo?.width).toBeCloseTo((plain?.width ?? 0) + 2 * average, 9);
	});

	test("make lint warn, naming the Node and the characters", () => {
		const { diagnostics } = render(
			architecture({ title: "Offices" }, (d) => {
				d.node({ id: "london", kind: "service", title: "London" });
				d.node({ id: "tokyo", kind: "service", title: "Tokyo 東京 ☃ 東" });
			}),
		);
		expect(diagnostics).toEqual([
			{
				severity: "warning",
				rule: "glyph-missing",
				message:
					"Node `tokyo`'s title has characters that the bundled font lacks: 東 (U+6771), 京 (U+4EAC) and ☃ (U+2603). They're measured at an average width, and drawn in a fallback font.",
				pointer: "/nodes/1/title",
			},
		]);
	});
});

describe("Group titles", () => {
	test("are shortened to fit their Group, with a warning that names the Group", () => {
		const { scene, diagnostics } = render(
			architecture({ title: "Shop" }, (d) => {
				d.group({ id: "eu-west", kind: "region", title: "EU West" }, (eu) => {
					eu.node({ id: "shop-api", kind: "service", title: "Shop API" });
				});
				d.group(
					{ id: "translations", kind: "system", title: "Internationalization and translation" },
					(system) => {
						system.node({ id: "translator", kind: "worker", title: "Translator" });
					},
				);
			}),
		);

		const [short, long] = scene?.groups ?? [];
		expect(short?.title).toMatchObject({ text: "EU West", shortened: false, weight: "semibold" });
		expect(long?.title.shortened).toBe(true);
		expect(long?.title.text).toMatch(/^Internationalization.*\S…$/);
		expect(long?.title.width).toBeCloseTo(
			widthInInterSemiBold(long?.title.text ?? "", long?.title.size ?? 0),
			9,
		);
		expect(diagnostics).toEqual([
			{
				severity: "warning",
				rule: "text-shortened",
				message: `Group \`translations\`'s title is too wide for its Group, so it's shortened to \`${long?.title.text}\`. Choose a shorter title to show it in full.`,
				pointer: "/groups/1/title",
			},
		]);
	});

	test("with characters the font lacks make lint warn, naming the Group", () => {
		const { diagnostics } = render(
			architecture({ title: "Offices" }, (d) => {
				d.group({ id: "tokyo", kind: "region", title: "東京" }, (tokyo) => {
					tokyo.node({ id: "tokyo-api", kind: "service", title: "Tokyo API" });
				});
			}),
		);
		expect(diagnostics).toEqual([
			{
				severity: "warning",
				rule: "glyph-missing",
				message:
					"Group `tokyo`'s title has characters that the bundled font lacks: 東 (U+6771) and 京 (U+4EAC). They're measured at an average width, and drawn in a fallback font.",
				pointer: "/groups/0/title",
			},
		]);
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
