/**
 * The bundled Inter fonts, on the Node side: where their files are, and the
 * function that gives the core a subset of them for each SVG.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FontData, FontWeight } from "../core/text.ts";
import { subsetFont } from "./subset.ts";
import { readTrueType, type TrueTypeFont } from "./truetype.ts";

/** The bundled font's file for each weight that the renderer draws text in. */
export const bundledFontFiles: Record<FontWeight, string> = {
	regular: fileURLToPath(new URL("../../fonts/Inter-Regular.ttf", import.meta.url)),
	semibold: fileURLToPath(new URL("../../fonts/Inter-SemiBold.ttf", import.meta.url)),
};

const fonts = new Map<FontWeight, TrueTypeFont>();

/** Subsets the bundled font to the characters an SVG draws. Each file is read once. */
export const bundledFontData: FontData = ({ weight, characters }) => {
	let font = fonts.get(weight);
	if (font === undefined) {
		font = readTrueType(new Uint8Array(readFileSync(bundledFontFiles[weight])));
		fonts.set(weight, font);
	}
	return subsetFont(font, characters);
};
