import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import example from "../docs/example-system.diagram.ts";
import { architecture, type FontRequest, render } from "../src/index.ts";
import everyKind from "./fixtures/every-kind.ts";
import {
	declarationsFor,
	embeddedFaces,
	externalReferences,
	renderWithFont,
	selectorsOf,
	styleOf,
} from "./support/fonts.ts";
import {
	advanceOf,
	bundledFont,
	characterMap,
	componentsOf,
	type FontFile,
	fontProblems,
	glyphCount,
	glyphHeader,
	openFont,
	tableStart,
} from "./support/truetype.ts";

const shop = architecture({ title: "Shop" }, (d) => {
	const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
	const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
	const db = d.node({ id: "shop-db", kind: "database", title: "Shop database" });
	const events = d.node({ id: "shop-events", kind: "queue", title: "Shop events" });
	d.edge(web, api, { kind: "call" });
	d.edge(api, db, { kind: "call" });
	d.edge(api, events, { kind: "message" });
});

const interSemiBoldFile = bundledFont("Inter-SemiBold.ttf");
const interSemiBold = characterMap(interSemiBoldFile);

/**
 * Every printable character of Basic Latin and Latin-1. Several are composite
 * glyphs, and Inter lacks one of them, the soft hyphen.
 */
const latin = architecture({ title: "Latin" }, (d) => {
	const characters = [];
	for (let code = 0x21; code <= 0xff; code++) {
		if (code < 0x7f || code > 0xa0) {
			characters.push(String.fromCodePoint(code));
		}
	}
	for (let start = 0; start < characters.length; start += 8) {
		d.node({
			id: `latin-${start}`,
			kind: "service",
			title: characters.slice(start, start + 8).join(" "),
		});
	}
});

/** The SVG's one embedded font, and the characters its titles draw. */
function subsetOf(diagram: unknown): { font: FontFile; drawn: Set<string> } {
	const { svg, scene } = renderWithFont(diagram);
	const faces = embeddedFaces(svg ?? "");
	expect(faces.map((face) => face.weight)).toEqual([600]);
	const drawn = new Set((scene?.nodes ?? []).flatMap((node) => [...node.title.text]));
	return { font: openFont(faces[0]?.data ?? new Uint8Array()), drawn };
}

/** Renders a Diagram, and records what the core asks its font data function for. */
function renderRecording(diagram: unknown): { svg: string; requests: FontRequest[] } {
	const requests: FontRequest[] = [];
	const { svg } = render(diagram, {
		fontData: (request) => {
			requests.push(request);
			return new Uint8Array([1, 2, 3, 250]);
		},
	});
	return { svg: svg ?? "", requests };
}

describe("the font data an SVG embeds", () => {
	test("comes from the caller's function, which the core asks for the characters each weight draws", () => {
		const { svg, requests } = renderRecording(shop);

		// Every character of "Web app", "Shop API", "Shop database" and "Shop events", once, in order.
		expect(requests).toEqual([{ weight: "semibold", characters: " AIPSWabdehnopstv" }]);
		expect(svg).toContain("data:font/ttf;base64,AQID+g==");
	});

	test("holds only the characters that are drawn, and that the font has", () => {
		const offices = architecture({ title: "Offices" }, (d) => {
			d.node({ id: "tokyo", kind: "service", title: "Tokyo 東京" });
			d.node({ id: "translations", kind: "service", title: "Internationalization service" });
		});
		const { requests } = renderRecording(offices);
		const { scene } = render(offices);

		const drawn = new Set((scene?.nodes ?? []).flatMap((node) => [...node.title.text]));
		expect(drawn).toContain("…");
		const expected = [...drawn]
			.filter((character) => interSemiBold.has(character.codePointAt(0) ?? 0))
			.sort((a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0))
			.join("");
		expect(expected).not.toMatch(/[東京v]/);
		expect(requests).toEqual([{ weight: "semibold", characters: expected }]);
	});

	test("holds the characters of callouts as well as titles", () => {
		const { requests } = renderRecording(
			architecture({ title: "Ledger" }, (d) => {
				d.node({ id: "ledger", kind: "database", title: "Ledger", callout: "SPOF" });
			}),
		);
		expect(requests).toEqual([{ weight: "semibold", characters: "FLOPSdegr" }]);
	});

	test("isn't asked for when nothing is drawn, or when the caller passes no function", () => {
		const { svg, requests } = renderRecording(architecture({ title: "Empty" }, () => {}));
		expect(requests).toEqual([]);
		expect(svg).not.toContain("@font-face");
		expect(render(shop).svg).not.toContain("@font-face");
	});
});

describe("the embedded subset", () => {
	test("maps exactly the characters the SVG draws in the bundled font, each to its glyph there", () => {
		for (const diagram of [shop, latin]) {
			const { font, drawn } = subsetOf(diagram);
			const mapped = characterMap(font);
			const inInter = [...drawn].filter((character) =>
				interSemiBold.has(character.codePointAt(0) ?? 0),
			);
			expect(inInter.length).toBeGreaterThan(diagram === latin ? 150 : 10);
			expect(new Set([...mapped.keys()].map((code) => String.fromCodePoint(code)))).toEqual(
				new Set(inInter),
			);
			for (const [code, glyph] of mapped) {
				const original = interSemiBold.get(code) ?? 0;
				expect(advanceOf(font, glyph)).toBe(advanceOf(interSemiBoldFile, original));
				expect(glyphHeader(font, glyph)).toEqual(glyphHeader(interSemiBoldFile, original));
			}
		}
	});

	test("holds no glyphs but those of the drawn characters, their components, and .notdef", () => {
		for (const diagram of [shop, latin]) {
			const { font } = subsetOf(diagram);
			const needed = new Set([0, ...characterMap(font).values()]);
			for (const glyph of needed) {
				for (const component of componentsOf(font, glyph)) {
					needed.add(component);
				}
			}
			expect(glyphCount(font)).toBe(needed.size);
		}
		expect(
			componentsOf(subsetOf(latin).font, characterMap(subsetOf(latin).font).get(0xe9) ?? 0),
		).not.toEqual([]);
	});

	test("is byte-identical from run to run, keeping the bundled font's own timestamps", () => {
		expect(renderWithFont(latin).svg).toBe(renderWithFont(latin).svg);
		// `head` holds the times the font was created and modified, in bytes 20 to 36.
		const timestamps = (font: FontFile) =>
			[...font.bytes.subarray(tableStart(font, "head") + 20, tableStart(font, "head") + 36)].join();
		expect(timestamps(subsetOf(shop).font)).toBe(timestamps(interSemiBoldFile));
	});

	test("is a well-formed TrueType font, with no tables for kerning or ligatures", () => {
		expect(fontProblems(interSemiBoldFile)).toEqual([]);
		for (const diagram of [shop, latin]) {
			const { font } = subsetOf(diagram);
			expect(fontProblems(font)).toEqual([]);
			expect(font.tables.map((table) => table.tag)).toEqual([
				"OS/2",
				"cmap",
				"glyf",
				"head",
				"hhea",
				"hmtx",
				"loca",
				"maxp",
				"name",
				"post",
			]);
		}
	});
});

/** The shop, with one more Edge: the same text, laid out and routed differently. */
const busierShop = architecture({ title: "Shop" }, (d) => {
	const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
	const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
	const db = d.node({ id: "shop-db", kind: "database", title: "Shop database" });
	const events = d.node({ id: "shop-events", kind: "queue", title: "Shop events" });
	d.edge(web, api, { kind: "call" });
	d.edge(api, db, { kind: "call" });
	d.edge(api, events, { kind: "message" });
	d.edge(db, events, { kind: "message" });
});

/** The shop, with one title changed. */
const renamedShop = architecture({ title: "Shop" }, (d) => {
	const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
	const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
	const db = d.node({ id: "shop-db", kind: "database", title: "Shop database" });
	const events = d.node({ id: "shop-events", kind: "queue", title: "Shop orders" });
	d.edge(web, api, { kind: "call" });
	d.edge(api, db, { kind: "call" });
	d.edge(api, events, { kind: "message" });
});

function familyOf(diagram: unknown): string {
	const families = new Set(
		embeddedFaces(renderWithFont(diagram).svg ?? "").map((face) => face.family),
	);
	expect(families.size).toBe(1);
	return [...families][0] ?? "";
}

function rootClassOf(svg: string): string {
	return svg.match(/^<svg [^>]*class="([^"]+)"/)?.[1] ?? "";
}

describe("the embedded font's family", () => {
	test("is named after the SVG's contents, so it changes whenever they do", () => {
		const family = familyOf(shop);
		expect(family).toMatch(/^diagram-[0-9a-f]+$/);
		expect(familyOf(shop)).toBe(family);
		expect(familyOf(JSON.parse(JSON.stringify(shop)))).toBe(family);
		expect(familyOf(renamedShop)).not.toBe(family);
		expect(familyOf(busierShop)).not.toBe(family);
	});
});

describe("the SVG's style", () => {
	test("scopes every selector to its SVG, by a class on the root that's named like its font", () => {
		for (const diagram of [shop, busierShop, latin]) {
			const svg = renderWithFont(diagram).svg ?? "";
			const scope = rootClassOf(svg);
			expect(scope).toBe(familyOf(diagram));
			const selectors = selectorsOf(styleOf(svg));
			expect(selectors.length).toBeGreaterThan(0);
			for (const selector of selectors) {
				expect(selector.split(/\s+/)[0]).toBe(`.${scope}`);
			}
		}
	});

	test("sets text in the embedded family, falling back only to fonts no wider than Inter", () => {
		const svg = renderWithFont(shop).svg ?? "";
		const root = declarationsFor(styleOf(svg), `.${rootClassOf(svg)}`);
		expect(root.get("font-family")).toBe(`"${familyOf(shop)}", Helvetica, Arial`);
		expect(svg).not.toMatch(/ font-family="/);
	});

	test("turns kerning and ligatures off, as measuring ignores them", () => {
		const svg = renderWithFont(shop).svg ?? "";
		const root = declarationsFor(styleOf(svg), `.${rootClassOf(svg)}`);
		expect(root.get("font-kerning")).toBe("none");
		expect(root.get("font-variant-ligatures")).toBe("none");
	});
});

describe("an SVG", () => {
	test("has no external references", () => {
		for (const diagram of [shop, latin, everyKind, example]) {
			expect(externalReferences(renderWithFont(diagram).svg ?? "")).toEqual([]);
		}
		const committed = new URL("../docs/example-system.diagram.svg", import.meta.url);
		expect(externalReferences(readFileSync(committed, "utf8"))).toEqual([]);

		// The check finds the references it looks for.
		const referring = `<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png"/>
<use href="#local"/><style>@import "b.css"; .x { background: url(c.png) } .y { fill: url(#d) }</style></svg>`;
		expect(externalReferences(referring)).toEqual([
			'href="https://example.com/a.png"',
			"url(c.png",
			'@import "b.css"',
			"https://example.com/a.png",
		]);
	});

	test("embeds a small subset for the example Diagram, well under the 30 KB budget", () => {
		const committed = readFileSync(
			new URL("../docs/example-system.diagram.svg", import.meta.url),
			"utf8",
		);
		const embedded = [...committed.matchAll(/base64,([A-Za-z0-9+/=]+)/g)].map(
			([, data]) => data ?? "",
		);
		expect(embedded).toHaveLength(1);
		const size = embedded.reduce((total, data) => total + data.length, 0);
		expect(size).toBeGreaterThan(1024);
		expect(size).toBeLessThanOrEqual(30 * 1024);
	});
});
