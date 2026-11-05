/**
 * The SVG's font, declared on the page. An SVG embeds the glyphs it draws in
 * font faces of its own style, but some browsers ignore a font face declared
 * inside a shadow root, where the component keeps the SVG. So the component
 * declares each of the SVG's faces on the document instead, for as long as
 * the SVG is on its stage.
 *
 * Each SVG names its font family after its own contents, so a family never
 * means two fonts, and Diagrams that show the same SVG share its faces.
 */

import type { Part } from "./stage.ts";

/** A family's faces on a document, and how many Diagrams there show its SVG. */
interface Declared {
	faces: FontFace[];
	users: number;
}

const declared = new WeakMap<FontFaceSet, Map<string, Declared>>();

export const fontFaces: Part = {
	setUp(stage) {
		stage.onShow(retainFontFaces);
	},
};

/** Retain retiring text until its transition ends, independently of the new SVG. */
export function retainFontFaces(svg: SVGSVGElement): () => void {
	const releases = facesOf(svg).map(({ family, descriptors, source }) => {
		const fonts = svg.ownerDocument.fonts;
		const families = declared.get(fonts) ?? new Map<string, Declared>();
		declared.set(fonts, families);
		const key = `${family} ${descriptors.weight}`;
		const entry = families.get(key) ?? { faces: [], users: 0 };
		families.set(key, entry);
		if (entry.users === 0) {
			const face = new FontFace(family, source, descriptors);
			fonts.add(face);
			entry.faces.push(face);
		}
		entry.users += 1;
		return () => {
			entry.users -= 1;
			if (entry.users === 0) {
				for (const face of entry.faces.splice(0)) {
					fonts.delete(face);
				}
				families.delete(key);
			}
		};
	});
	return () => {
		for (const release of releases) {
			release();
		}
	};
}

/** Each font face that an SVG's own style declares: its family, its weight, and where its data is. */
function facesOf(svg: SVGSVGElement) {
	return [...svg.querySelectorAll<SVGStyleElement>(":scope > style")]
		.flatMap((style) => [...(style.sheet?.cssRules ?? [])])
		.filter((rule): rule is CSSFontFaceRule => rule instanceof CSSFontFaceRule)
		.map((rule) => ({
			// A family's name is written in quotes, which aren't part of it.
			family: rule.style.getPropertyValue("font-family").replace(/^["']|["']$/g, ""),
			descriptors: { weight: rule.style.getPropertyValue("font-weight") },
			source: rule.style.getPropertyValue("src"),
		}));
}
