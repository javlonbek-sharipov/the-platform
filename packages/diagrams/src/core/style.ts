/**
 * An SVG's style: the faces of the embedded font, the rule that every text
 * inherits its font stack from, and the theme's rules, one for each use of a
 * color that the drawing holds. Inlined into a page, an SVG's style applies to
 * the whole page, so every selector is scoped to the SVG.
 */

import { definitionOf, type Notation, nodeKindsOf } from "../notations/notation.ts";
import { base64 } from "./encoding.ts";
import type { Scene } from "./scene.ts";
import { drawnTexts, type FontData, type FontWeight, hasCharacter } from "./text.ts";
import { type ColorName, palette, type ThemeColor } from "./theme.ts";
import { indent } from "./xml.ts";

export const fontWeights: Record<FontWeight, number> = { regular: 400, semibold: 600 };

/**
 * Where the embedded font can't be used, text falls back to fonts no wider
 * than Inter, so that text shortened to fit still fits. There's no generic
 * family at the end, since that could be a wider font.
 */
const fallbackFonts = "Helvetica, Arial";

/**
 * One place the SVG uses a color: the elements a selector picks, inside the
 * SVG, which of their properties takes the color, and the color: the name of
 * its property, after `--diagram-`, and its fallbacks.
 */
export interface ColorUse {
	selector: string;
	property: "fill" | "stroke" | "color";
	color: string;
	fallback: ThemeColor;
}

/**
 * A use of a color that the drawing may make, and what the drawing holds when
 * it makes it: an element of a class, or with an attribute. A use without it
 * is made whenever it's listed.
 */
interface PossibleUse extends ColorUse {
	needs?: string;
}

/** A use of one of the colors that every Diagram shares. */
function shared(
	selector: string,
	property: ColorUse["property"],
	color: ColorName,
	needs: string,
): PossibleUse {
	return { selector, property, color, fallback: palette[color], needs };
}

/** A use of a shared color by the elements of one class, which it needs. */
function byClass(name: string, property: ColorUse["property"], color: ColorName): PossibleUse {
	return shared(`.${name}`, property, color, name);
}

/**
 * The uses of colors that a drawing needs, in a fixed order: each one whose
 * elements the drawing's lines hold. Each Node takes its Kind's hue, from its
 * Notation, as its `color`, which the parts of its outline and its badge use,
 * and so does each status mark, and each Edge, its casing apart.
 */
export function colorUses(drawing: string[], notation: Notation): ColorUse[] {
	const text = drawing.join("\n");
	const held = new Set<string>();
	for (const [, names = ""] of text.matchAll(/ class="([^"]+)"/g)) {
		for (const name of names.split(" ")) {
			held.add(name);
		}
	}
	for (const attribute of ["data-edge", "data-crosses"]) {
		if (text.includes(` ${attribute}="`)) {
			held.add(attribute);
		}
	}
	const kinds = new Set(
		[...text.matchAll(/ data-node="[^"]*" data-kind="([^"]+)"/g)].map(([, kind]) => kind),
	);
	// One rule for each hue, which the Kinds that share it take together.
	const hues = Object.entries(notation.hues).flatMap(([hue, fallback]): PossibleUse[] => {
		const members = nodeKindsOf(notation).filter(
			(kind) => kinds.has(kind) && definitionOf(notation.nodeKinds, kind).hue === hue,
		);
		return members.length === 0
			? []
			: [
					{
						selector: members.map((kind) => `[data-node][data-kind="${kind}"]`).join(", "),
						property: "color",
						color: `hue-${hue}`,
						fallback,
					},
				];
	});
	const possible: PossibleUse[] = [
		byClass("diagram-background", "fill", "background"),
		byClass("diagram-group", "stroke", "border"),
		byClass("diagram-group-title", "fill", "muted"),
		shared(".diagram-edges", "color", "edge", "data-edge"),
		byClass("diagram-casing", "stroke", "edge-casing"),
		shared("[data-crosses]", "color", "warn", "data-crosses"),
		shared("[data-crosses] .diagram-casing", "stroke", "warn-casing", "data-crosses"),
		byClass("diagram-badge", "stroke", "surface"),
		// A role tag hides its Edge's line behind it, inside an outline in the Edges' color.
		byClass("diagram-role", "fill", "background"),
		byClass("diagram-role", "stroke", "edge"),
		byClass("diagram-role-text", "fill", "ink"),
		byClass("diagram-label", "fill", "background"),
		byClass("diagram-label-text", "fill", "ink"),
		byClass("diagram-label-detail", "fill", "muted"),
		byClass("diagram-base", "fill", "surface"),
		...hues,
		...Object.entries(notation.statuses).map(([status, { color }]) =>
			byClass(`diagram-status-${status}`, "color", color),
		),
		byClass("diagram-text", "fill", "ink"),
		byClass("diagram-technology", "fill", "muted"),
		// Every logo is drawn in one color of the theme, never in its brand's.
		byClass("diagram-logo", "fill", "muted"),
		byClass("diagram-highlight", "stroke", "accent"),
		byClass("diagram-tag", "fill", "accent"),
		byClass("diagram-tag-text", "fill", "surface"),
	];
	return possible
		.filter(({ needs }) => needs === undefined || held.has(needs))
		.map(({ selector, property, color, fallback }) => ({ selector, property, color, fallback }));
}

/**
 * One rule for each use of a color, with its light fallback, then the same
 * rules again with dark fallbacks, for viewers who prefer a dark scheme. Each
 * selector is scoped to the SVG.
 */
export function themeRules(scope: string, uses: ColorUse[]): string[] {
	const rule = (use: ColorUse, theme: "light" | "dark") => {
		const selectors = use.selector
			.split(", ")
			.map((selector) => `.${scope} ${selector}`)
			.join(", ");
		return `${selectors} { ${use.property}: var(--diagram-${use.color}, ${use.fallback[theme]}); }`;
	};
	return [
		...uses.map((use) => rule(use, "light")),
		"@media (prefers-color-scheme: dark) {",
		...uses.map((use) => indent(1, rule(use, "dark"))),
		"}",
	];
}

export interface EmbeddedFont {
	weight: FontWeight;
	/** The font data, in base64. */
	data: string;
}

/** The font data for each weight that the scene draws text in, in a fixed order. */
export function embeddedFonts(scene: Scene, fontData: FontData): EmbeddedFont[] {
	const texts = drawnTexts(scene);
	return (["regular", "semibold"] as const).flatMap((weight) => {
		const drawn = new Set(
			texts.filter((text) => text.weight === weight).flatMap((text) => [...text.text]),
		);
		const characters = [...drawn]
			.filter((character) => hasCharacter(character, weight))
			.sort((a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0))
			.join("");
		return characters === "" ? [] : [{ weight, data: base64(fontData({ weight, characters })) }];
	});
}

/**
 * The SVG's style element: the embedded font's faces; one rule for the SVG's
 * root, which every text inherits from, and which turns kerning and
 * ligatures off, since measuring ignores them; and the theme's rules.
 */
export function styleElement(scope: string, fonts: EmbeddedFont[], uses: ColorUse[]): string[] {
	return [
		"<style>",
		...fonts.map((font) =>
			indent(
				1,
				`@font-face { font-family: "${scope}"; font-weight: ${fontWeights[font.weight]}; src: url("data:font/ttf;base64,${font.data}") format("truetype"); }`,
			),
		),
		indent(
			1,
			`.${scope} { font-family: "${scope}", ${fallbackFonts}; font-kerning: none; font-variant-ligatures: none; }`,
		),
		...themeRules(scope, uses).map((text) => indent(1, text)),
		"</style>",
	];
}
