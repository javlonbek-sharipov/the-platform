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
