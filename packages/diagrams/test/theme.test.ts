import { describe, expect, test } from "vitest";
import example from "../docs/example-system.diagram.ts";
import { architecture, notations, render, themeColors } from "../src/index.ts";
import { contextMap } from "./fixtures/context-map.ts";
import everyKind from "./fixtures/every-kind.ts";
import externalStatusCallout from "./fixtures/external-status-callout.ts";
import technologies from "./fixtures/technologies.ts";
import { everyFixture } from "./support/fixtures.ts";
import { renderWithFont } from "./support/fonts.ts";
import {
	colorUnder,
	computedStyle,
	contrast,
	declarationsOf,
	descendants,
	luminance,
	parseColor,
	parseSvg,
	type Rule,
	rulesOf,
	type Theme,
} from "./support/svg.ts";

const themes: Theme[] = ["light", "dark"];

/** Long and shortened titles, beside the every-Kind fixture and the example. */
const titles = architecture({ title: "Titles" }, (d) => {
	d.node({ id: "translations", kind: "service", title: "Internationalization service" });
	d.node({ id: "orders-db", kind: "database", title: "Orders database" });
});

/** A callout laid out down, where its tag is narrower. */
const downward = architecture({ title: "Downward", direction: "down" }, (d) => {
	const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
	const api = d.node({ id: "orders-api", kind: "service", title: "Orders API", callout: "SPOF" });
	d.edge(web, api, { kind: "call" });
});

const fixtures: Record<string, unknown> = {
	"every Kind": everyKind,
	"External, status and callout": externalStatusCallout,
	technologies,
	example,
	titles,
	downward,
	// Contexts, role tags and labels, in the domain Notation's hue.
	"a context map": contextMap("right"),
};

function svgOf(diagram: unknown): string {
	const { svg, diagnostics } = renderWithFont(diagram);
	expect(diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
	if (svg === undefined) {
		throw new Error("expected an SVG");
	}
	return svg;
}

/** The properties whose values are colors. */
const colorProperties = new Set([
	"fill",
	"stroke",
	"color",
	"stop-color",
	"flood-color",
	"lighting-color",
]);

/** `var(--diagram-name, #rrggbb)` */
const customProperty = /^var\(--diagram-[a-z0-9]+(?:-[a-z0-9]+)*, #[0-9a-f]{6}\)$/;

/** Each use of a color in the rules: the selector, the property, and the custom property it reads. */
function colorUses(rules: Rule[]): [string, string, string][] {
	return rules.flatMap((rule) =>
		rule.declarations
			.filter(([property]) => colorProperties.has(property))
			.map(([property, value]): [string, string, string] => [
				rule.selectors.join(", "),
				property,
				value.match(/--diagram-[\w-]+/)?.[0] ?? value,
			]),
	);
}

/**
 * Every literal color in an SVG that isn't the fallback of a `--diagram-`
 * property: in an attribute, an inline style or the style sheet. Text, data
 * attributes, class names and the embedded font aren't searched.
 */
function literalColors(svg: string): string[] {
	const literal = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/g;
	const keywords = ["none", "currentColor"];
	const found: string[] = [];
	const checkDeclarations = (declarations: [string, string][]) => {
		for (const [property, value] of declarations) {
			const rest = value.replace(/var\(--diagram-[\w-]+, #[0-9a-f]{6}\)/g, "").trim();
			if (colorProperties.has(property) && rest !== "" && !keywords.includes(rest)) {
				found.push(`${property}: ${value}`);
			} else {
				found.push(...(rest.match(literal) ?? []));
			}
		}
	};
	for (const element of descendants(parseSvg(svg))) {
		for (const [name, value] of element.attributes) {
			if (name.startsWith("data-") || name === "class") {
				continue;
			}
			if (name === "style") {
				checkDeclarations(declarationsOf(value));
			} else if (colorProperties.has(name) && !keywords.includes(value)) {
				found.push(`${name}="${value}"`);
			} else {
				found.push(...(value.match(literal) ?? []));
			}
		}
		if (element.name === "style") {
			const css = element.text.replace(/@font-face\s*\{[^}]*\}/g, "");
			for (const [, block = ""] of css.matchAll(/\{([^{}]*)\}/g)) {
				checkDeclarations(declarationsOf(block));
			}
		}
	}
	return found;
}

describe("an SVG's colors", () => {
	test("each come from a --diagram- custom property, with a fallback", () => {
		for (const [name, diagram] of Object.entries(fixtures)) {
			const rules = rulesOf(parseSvg(svgOf(diagram)));
			const declarations = rules.flatMap((rule) => rule.declarations);
			const colors = declarations.filter(([property]) => colorProperties.has(property));
			expect(colors.length, name).toBeGreaterThan(0);
			for (const [property, value] of colors) {
				expect(value, `${name}: ${property}`).toMatch(customProperty);
			}
		}
	});

	test("are each used again in a prefers-color-scheme: dark rule, with dark fallbacks", () => {
		for (const [name, diagram] of Object.entries(fixtures)) {
			const rules = rulesOf(parseSvg(svgOf(diagram)));
			const light = rules.filter((rule) => !rule.dark);
			const dark = rules.filter((rule) => rule.dark);
			expect(colorUses(dark), name).toEqual(colorUses(light));
			expect(
				colorUses(light).length,
				`${name}: the dark rule changes some fallbacks`,
			).toBeGreaterThan(0);
			const fallbacks = (some: Rule[]) =>
				some.flatMap((rule) => rule.declarations.map(([, value]) => value));
			expect(fallbacks(dark), name).not.toEqual(fallbacks(light));
		}
	});

	test("follow the viewer's theme, painting the background light or dark", () => {
		for (const [name, diagram] of Object.entries(fixtures)) {
			const root = parseSvg(svgOf(diagram));
			const rules = rulesOf(root);
			const [x = 0, y = 0] = (root.attributes.get("viewBox") ?? "").split(" ").map(Number);
			const corner = { x: x + 1, y: y + 1 };
			const last = descendants(root).at(-1) ?? root;
			const behind = (theme: Theme) => luminance(colorUnder(root, last, corner, rules, theme));
			expect(behind("light"), name).toBeGreaterThan(0.8);
			expect(behind("dark"), name).toBeLessThan(0.05);
		}
	});

	test("are nowhere else in the SVG", () => {
		for (const [name, diagram] of Object.entries(fixtures)) {
			expect(literalColors(svgOf(diagram)), name).toEqual([]);
		}

		// The check finds the colors it looks for.
		const colorful = `<svg xmlns="http://www.w3.org/2000/svg"><style>.a { fill: var(--diagram-ink, #000000); }
.b { stroke: #123456; } .c { color: red; } .d { fill: none; }</style><rect fill="white" class="red"/>
<path stroke="#abc" d="M 0 0"/><g style="fill: rgb(1, 2, 3)" data-color="#fff"/><text fill="currentColor">#abcdef</text></svg>`;
		expect(literalColors(colorful)).toEqual([
			"stroke: #123456",
			"color: red",
			'fill="white"',
			'stroke="#abc"',
			"fill: rgb(1, 2, 3)",
		]);
	});

	test("give text a contrast of at least 4.5:1 against what's behind it, in both themes", () => {
		for (const [name, diagram] of Object.entries(fixtures)) {
			const root = parseSvg(svgOf(diagram));
			const rules = rulesOf(root);
			const texts = descendants(root).filter((element) => element.name === "text");
			expect(texts.length, name).toBeGreaterThan(0);
			for (const theme of themes) {
				for (const text of texts) {
					const point = {
						x: Number(text.attributes.get("x")),
						y: Number(text.attributes.get("y")),
					};
					const ink = parseColor(computedStyle(text, rules, theme).get("fill") ?? "");
					expect(ink, `${name}: ${text.text}`).toBeDefined();
					const ratio = contrast(ink ?? [0, 0, 0], colorUnder(root, text, point, rules, theme));
					expect(ratio, `${name}, ${theme}: ${text.text}`).toBeGreaterThanOrEqual(4.5);
				}
			}
		}
	});
});

describe("the theme's colors, for a page that sets them itself", () => {
	test("hold every property that an SVG reads, with the fallbacks it has there", async () => {
		const theme = themeColors(notations);
		let read = 0;
		for (const [name, diagram] of await everyFixture()) {
			const { svg = "" } = render(diagram);
			for (const rule of rulesOf(parseSvg(svg))) {
				for (const [property, value] of rule.declarations) {
					const [, color = "", fallback] =
						/^var\(--diagram-([\w-]+), (#[0-9a-f]{6})\)$/.exec(value) ?? [];
					if (colorProperties.has(property)) {
						expect(theme[color]?.[rule.dark ? "dark" : "light"], `${name}: ${value}`).toBe(
							fallback,
						);
						read += 1;
					}
				}
			}
		}
		expect(read).toBeGreaterThan(0);
	});

	test("name each Notation's hues as their properties do", () => {
		expect(themeColors(notations)).toMatchObject({
			ink: { light: "#1f2328", dark: "#f0f6fc" },
			"hue-compute": { light: "#0969da", dark: "#4493f8" },
			"hue-context": { light: "#4f55c8", dark: "#8f96f5" },
			"hue-aggregate": { light: "#27694c", dark: "#70cda0" },
			"hue-event": { light: "#935619", dark: "#e8ae68" },
		});
	});
});

describe("the SVG reader the color tests use", () => {
	test("agrees with known contrast ratios, and blends translucent fills", () => {
		expect(contrast([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5);
		expect(contrast([118, 118, 118], [255, 255, 255])).toBeCloseTo(4.54, 2);

		const root =
			parseSvg(`<svg xmlns="http://www.w3.org/2000/svg"><style>.s .tint { color: var(--diagram-x, #0000ff); }
@media (prefers-color-scheme: dark) { .s .tint { color: var(--diagram-x, #ff0000); } }</style>
<g class="s"><rect x="0" y="0" width="10" height="10" fill="#ffffff"/>
<path class="tint" d="M 0 0 H 10 V 10 H 0 Z" fill="currentColor" fill-opacity="0.5"/><text x="5" y="5">a</text></g></svg>`);
		const rules = rulesOf(root);
		const text = descendants(root).find((element) => element.name === "text") ?? root;
		expect(colorUnder(root, text, { x: 5, y: 5 }, rules, "light")).toEqual([127.5, 127.5, 255]);
		expect(colorUnder(root, text, { x: 5, y: 5 }, rules, "dark")).toEqual([255, 127.5, 127.5]);
		expect(() => colorUnder(root, text, { x: 20, y: 5 }, rules, "light")).toThrow();
	});
});
