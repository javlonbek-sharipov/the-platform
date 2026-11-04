/**
 * Measuring text with metrics generated from the bundled Inter fonts, so that
 * layout needs no font file, and Node and browsers measure alike. Measuring
 * ignores kerning and ligatures, and the SVG turns both off, so drawn text
 * matches measured text.
 */

import type { Diagram } from "../authoring/model.ts";
import type { Diagnostic } from "./diagnostics.ts";
import { fontMetrics } from "./font-metrics.ts";
import type { Box, SceneNode, SceneText } from "./scene.ts";

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
/** The room a title leaves on each side, between it and the edge of its Node. */
const titlePadding = 12;
const ellipsis = "…";

/** A Node's title, centered in its header, and shortened if it's too wide for the header. */
export function nodeTitle(title: string, header: Box): SceneText {
	return {
		...fit(title, "semibold", titleSize, header.width - 2 * titlePadding),
		point: { x: header.x + header.width / 2, y: header.y + header.height / 2 },
		weight: "semibold",
		size: titleSize,
	};
}

/** A warning for each title that had to be shortened. */
export function titleDiagnostics(diagram: Diagram, nodes: SceneNode[]): Diagnostic[] {
	const titles = new Map(nodes.map((node) => [node.id, node.title]));
	return diagram.nodes.flatMap((node, index): Diagnostic[] => {
		const title = titles.get(node.id);
		if (title?.shortened !== true) {
			return [];
		}
		return [
			{
				severity: "warning",
				rule: "text-shortened",
				message: `Node \`${node.id}\`'s title is too wide for its Node, so it's shortened to \`${title.text}\`. Choose a shorter title to show it in full.`,
				pointer: `/nodes/${index}/title`,
			},
		];
	});
}

/**
 * The text as it fits in `maxWidth`. A text that's too wide keeps the longest
 * start that fits with an ellipsis after it, leaving out spaces before the
 * ellipsis.
 */
function fit(
	text: string,
	weight: FontWeight,
	size: number,
	maxWidth: number,
): { text: string; width: number; shortened: boolean } {
	const { unitsPerEm } = metrics[weight];
	// Comparing in font units, multiplied out, keeps every comparison exact.
	const fits = (units: number) => units * size <= maxWidth * unitsPerEm;
	// A text's width is its characters' advance widths, summed.
	const characters = [...text];
	const widths = characters.map((character) => unitsOf(character, weight));
	const total = widths.reduce((sum, width) => sum + width, 0);
	if (fits(total)) {
		return { text, width: (total * size) / unitsPerEm, shortened: false };
	}

	const ellipsisUnits = unitsOf(ellipsis, weight);
	let kept = 0;
	let keptUnits = 0;
	let units = 0;
	let trimmed = 0;
	let trimmedUnits = 0;
	for (const [index, character] of characters.entries()) {
		units += widths[index] ?? 0;
		if (!/\s/.test(character)) {
			trimmed = index + 1;
			trimmedUnits = units;
		}
		if (!fits(trimmedUnits + ellipsisUnits)) {
			break;
		}
		kept = trimmed;
		keptUnits = trimmedUnits;
	}
	return {
		text: characters.slice(0, kept).join("") + ellipsis,
		width: ((keptUnits + ellipsisUnits) * size) / unitsPerEm,
		shortened: true,
	};
}

/** One character's advance width, in font units. Kerning and ligatures never change it. */
function unitsOf(character: string, weight: FontWeight): number {
	const { widths, averageWidth } = metrics[weight];
	return widths.get(character.codePointAt(0) ?? 0) ?? averageWidth;
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
