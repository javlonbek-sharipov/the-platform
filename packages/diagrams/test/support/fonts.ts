import { render } from "../../src/core/render.ts";
import { bundledFontData } from "../../src/fonts/bundled.ts";

/** Renders a Diagram as the Atlas does: with the bundled font. */
export function renderWithFont(diagram: unknown): ReturnType<typeof render> {
	return render(diagram, { fontData: bundledFontData });
}

export interface EmbeddedFace {
	family: string;
	weight: number;
	data: Uint8Array;
}

/** Each `@font-face` in an SVG's style, with its font data decoded. */
export function embeddedFaces(svg: string): EmbeddedFace[] {
	const rules = svg.match(/@font-face \{[^}]*\}/g) ?? [];
	return rules.map((rule) => {
		const family = rule.match(/font-family: "([^"]+)"/)?.[1];
		const weight = rule.match(/font-weight: (\d+)/)?.[1];
		const data = rule.match(/url\("data:font\/ttf;base64,([A-Za-z0-9+/=]+)"\)/)?.[1];
		if (family === undefined || weight === undefined || data === undefined) {
			throw new Error(`can't read ${rule.slice(0, 120)}`);
		}
		return { family, weight: Number(weight), data: new Uint8Array(Buffer.from(data, "base64")) };
	});
}

/** The text of the SVG's `<style>` element. */
export function styleOf(svg: string): string {
	const style = svg.match(/<style>([\s\S]*?)<\/style>/)?.[1];
	if (style === undefined) {
		throw new Error("the SVG has no style");
	}
	return style;
}

/**
 * Every selector in a style sheet, from its style rules at any depth, such as
 * those inside `@media`. A `@font-face` rule has none.
 */
export function selectorsOf(css: string): string[] {
	const selectors: string[] = [];
	let prelude = "";
	for (const character of css) {
		if (character === "{") {
			// An at-rule's prelude, such as `@media …` or `@font-face`, isn't a selector.
			const text = prelude.trim();
			if (!text.startsWith("@")) {
				selectors.push(...text.split(",").map((selector) => selector.trim()));
			}
			prelude = "";
		} else if (character === "}" || character === ";") {
			prelude = "";
		} else {
			prelude += character;
		}
	}
	return selectors;
}

/** The declarations of the style rules whose selector is exactly the one given. */
export function declarationsFor(css: string, selector: string): Map<string, string> {
	const declarations = new Map<string, string>();
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	for (const [, block = ""] of css.matchAll(
		new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`, "g"),
	)) {
		for (const declaration of block.split(";")) {
			const colon = declaration.indexOf(":");
			if (colon > 0) {
				declarations.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim());
			}
		}
	}
	return declarations;
}
