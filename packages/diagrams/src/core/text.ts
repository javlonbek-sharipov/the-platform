/**
 * Measuring text with metrics generated from the bundled Inter fonts, so that
 * layout needs no font file, and Node and browsers measure alike. Measuring
 * ignores kerning and ligatures, and the SVG turns both off, so drawn text
 * matches measured text.
 */

import { fontMetrics } from "./font-metrics.ts";
import type { Box, SceneText } from "./scene.ts";

/** The weights that text is drawn in: regular for Rows and labels, and semibold for titles. */
export type FontWeight = "regular" | "semibold";

interface Metrics {
	unitsPerEm: number;
	averageWidth: number;
	/** The advance width of each character the font has, by code point. */
	widths: Map<number, number>;
}

const metrics: Record<FontWeight, Metrics> = {
	regular: decode(fontMetrics.regular),
	semibold: decode(fontMetrics.semibold),
};

const titleSize = 14;

/** A Node's title, centered in its header. */
export function nodeTitle(title: string, header: Box): SceneText {
	return {
		text: title,
		point: { x: header.x + header.width / 2, y: header.y + header.height / 2 },
		width: measure(title, "semibold", titleSize),
		weight: "semibold",
		size: titleSize,
	};
}

/** A text's width when drawn in the given weight and size: its characters' advance widths, summed. */
export function measure(text: string, weight: FontWeight, size: number): number {
	const { unitsPerEm, averageWidth, widths } = metrics[weight];
	let units = 0;
	for (const character of text) {
		units += widths.get(character.codePointAt(0) ?? 0) ?? averageWidth;
	}
	return (units * size) / unitsPerEm;
}

function decode(font: { unitsPerEm: number; averageWidth: number; widths: string[] }): Metrics {
	const widths = new Map<number, number>();
	for (const row of font.widths) {
		const [first = "", ...fields] = row.split(" ");
		const start = Number.parseInt(first, 16);
		fields.forEach((field, index) => {
			if (field !== "-") {
				widths.set(start + index, Number(field));
			}
		});
	}
	return { unitsPerEm: font.unitsPerEm, averageWidth: font.averageWidth, widths };
}
