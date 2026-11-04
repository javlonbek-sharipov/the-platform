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

/** What an SVG needs of the bundled font in one weight. */
export interface FontRequest {
	weight: FontWeight;
	/**
	 * Every character that the SVG draws in this weight and that the font has,
	 * once each, in code point order.
	 */
	characters: string;
}

/**
 * Gives the core the font data for an SVG: a TrueType font with the glyphs of
 * the characters asked for. The caller passes it in, so the core never reads
 * a file.
 */
export type FontData = (request: FontRequest) => Uint8Array;

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
const groupTitleSize = 13;
/** The room a title leaves on each side, between it and the edge of its Node or label box. */
export const titlePadding = 12;
const ellipsis = "…";

/** A Node's title, centered in its header, and shortened if it's too wide for the header. */
export function nodeTitle(title: string, header: Box): SceneText {
	return {
		...fit(collapseSpaces(title), "semibold", titleSize, header.width - 2 * titlePadding),
		point: { x: header.x + header.width / 2, y: header.y + header.height / 2 },
		weight: "semibold",
		size: titleSize,
	};
}

/**
 * A Group's title, at the start of its label band, and shortened if it's too
 * wide for the band.
 */
export function groupTitle(title: string, band: Box): SceneText {
	const fitted = fit(
		collapseSpaces(title),
		"semibold",
		groupTitleSize,
		band.width - 2 * titlePadding,
	);
	return {
		...fitted,
		point: { x: band.x + titlePadding + fitted.width / 2, y: band.y + band.height / 2 },
		weight: "semibold",
		size: groupTitleSize,
	};
}

/** A warning for each title with characters that the font lacks, and for each one shortened. */
export function titleDiagnostics(diagram: Diagram, nodes: SceneNode[]): Diagnostic[] {
	const titles = new Map(nodes.map((node) => [node.id, node.title]));
	return diagram.nodes.flatMap((node, index) => {
		const diagnostics: Diagnostic[] = [];
		const pointer = `/nodes/${index}/title`;
		const missing = missingCharacters(collapseSpaces(node.title), "semibold");
		if (missing.length > 0) {
			const listed = list(missing.map((character) => `${character} (${codePointOf(character)})`));
			diagnostics.push({
				severity: "warning",
				rule: "glyph-missing",
				message:
					missing.length === 1
						? `Node \`${node.id}\`'s title has a character that the bundled font lacks: ${listed}. It's measured at an average width, and drawn in a fallback font.`
						: `Node \`${node.id}\`'s title has characters that the bundled font lacks: ${listed}. They're measured at an average width, and drawn in a fallback font.`,
				pointer,
			});
		}
		const title = titles.get(node.id);
		if (title?.shortened === true) {
			diagnostics.push({
				severity: "warning",
				rule: "text-shortened",
				message: `Node \`${node.id}\`'s title is too wide for its Node, so it's shortened to \`${title.text}\`. Choose a shorter title to show it in full.`,
				pointer,
			});
		}
		return diagnostics;
	});
}

/** Each character in the text that the font lacks, once, in order. */
function missingCharacters(text: string, weight: FontWeight): string[] {
	return [...new Set(text)].filter((character) => !hasCharacter(character, weight));
}

/** `U+6771` */
function codePointOf(character: string): string {
	return `U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;
}

/** `a, b and c` */
function list(words: string[]): string {
	return words.length < 2
		? words.join("")
		: `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * Runs of spaces, tabs and line breaks as one space, with none at either end.
 * SVG renderers collapse them that way, though not all alike, so the SVG gets
 * text that's already collapsed.
 */
function collapseSpaces(text: string): string {
	return text.replace(/[ \t\n\r]+/g, " ").replace(/^ | $/g, "");
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

/** Whether the bundled font has a glyph for the character, in the given weight. */
export function hasCharacter(character: string, weight: FontWeight): boolean {
	return metrics[weight].widths.has(character.codePointAt(0) ?? 0);
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
