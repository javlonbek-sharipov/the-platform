/**
 * Measuring text with metrics generated from the bundled Inter fonts, so that
 * layout needs no font file, and Node and browsers measure alike. Measuring
 * ignores kerning and ligatures, and the SVG turns both off, so drawn text
 * matches measured text.
 */

import type { Diagram, Row } from "../authoring/model.ts";
import type { Diagnostic } from "./diagnostics.ts";
import { fontMetrics } from "./font-metrics.ts";
import type { Box, SceneGroup, SceneNode, SceneText } from "./scene.ts";

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
/** The room a Group's title leaves on each side, between it and the edge of its label box. */
export const labelPadding = 12;
const calloutSize = 11;
const rowSize = 12;
/** The room a Row leaves on each side, between its text and the edge of its Node. */
const rowPadding = 12;
/** The least room between a Row's name and its value. */
const rowGap = 8;
const ellipsis = "…";

/**
 * A Node's title, centered in the room its header leaves for it, and
 * shortened if it's too wide for that room.
 */
export function nodeTitle(title: string, room: Box): SceneText {
	return {
		...fit(collapseSpaces(title), "semibold", titleSize, room.width),
		point: { x: room.x + room.width / 2, y: room.y + room.height / 2 },
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
		band.width - 2 * labelPadding,
	);
	return {
		...fitted,
		point: { x: band.x + labelPadding + fitted.width / 2, y: band.y + band.height / 2 },
		weight: "semibold",
		size: groupTitleSize,
	};
}

/**
 * A callout's text, for the tag above its Node: it starts at `left`, centered
 * on `middle` from top to bottom, and is shortened if it's wider than
 * `maxWidth`, so that the tag can be as wide as its text.
 */
export function calloutText(
	callout: string,
	left: number,
	middle: number,
	maxWidth: number,
): SceneText {
	const fitted = fit(collapseSpaces(callout), "semibold", calloutSize, maxWidth);
	return {
		...fitted,
		point: { x: left + fitted.width / 2, y: middle },
		weight: "semibold",
		size: calloutSize,
	};
}

/**
 * A Row's text, level in the middle of its band: its name on the left, and
 * its value, if it has one, on the right. When the two don't fit side by
 * side, the name is shortened first, as far as its first character and an
 * ellipsis, and only then the value.
 */
export function rowTexts(row: Row, band: Box): { name: SceneText; value?: SceneText } {
	const y = band.y + band.height / 2;
	const left = band.x + rowPadding;
	const right = band.x + band.width - rowPadding;
	const room = right - left;
	const text = (fitted: Fitted, x: number): SceneText => ({
		...fitted,
		point: { x, y },
		weight: "regular",
		size: rowSize,
	});
	const name = collapseSpaces(row.name);
	const value = row.value === undefined ? "" : collapseSpaces(row.value);
	if (value === "") {
		const alone = fit(name, "regular", rowSize, room);
		return { name: text(alone, left + alone.width / 2) };
	}
	const shortest = fit(name, "regular", rowSize, rowWidthOf(`${[...name][0] ?? ""}${ellipsis}`));
	const fittedValue = fit(value, "regular", rowSize, room - rowGap - shortest.width);
	const fittedName = fittedValue.shortened
		? shortest
		: fit(name, "regular", rowSize, room - rowGap - fittedValue.width);
	return {
		name: text(fittedName, left + fittedName.width / 2),
		value: text(fittedValue, right - fittedValue.width / 2),
	};
}

/** A text's width in a Row: its characters' advance widths, summed. */
function rowWidthOf(text: string): number {
	const units = [...text].reduce((sum, character) => sum + unitsOf(character, "regular"), 0);
	return (units * rowSize) / metrics.regular.unitsPerEm;
}

/**
 * A warning for each piece of text with characters that the font lacks, and
 * for each one shortened: every Node's title, its Rows' names and values, and
 * its callout, then every Group's title.
 */
export function textDiagnostics(
	diagram: Diagram,
	nodes: SceneNode[],
	groups: SceneGroup[],
): Diagnostic[] {
	const drawn = new Map(nodes.map((node) => [node.id, node]));
	const groupTitles = diagram.groups.map((group, index): CheckedText => {
		const named = `Group \`${group.id}\``;
		return {
			source: group.title,
			// The scene keeps the model's order.
			drawn: groups[index]?.title,
			weight: "semibold",
			pointer: `/groups/${index}/title`,
			lacking: (some) => `${named}'s title has ${some} that the bundled font lacks`,
			shortened: (text) =>
				`${named}'s title is too wide for its Group, so it's shortened to \`${text}\`. Choose a shorter title to show it in full.`,
		};
	});
	const nodeTexts = diagram.nodes.flatMap((node, index) => {
		const scene = drawn.get(node.id);
		const named = `Node \`${node.id}\``;
		const title: CheckedText = {
			source: node.title,
			drawn: scene?.title,
			weight: "semibold",
			pointer: `/nodes/${index}/title`,
			lacking: (some) => `${named}'s title has ${some} that the bundled font lacks`,
			shortened: (text) =>
				`${named}'s title is too wide for its Node, so it's shortened to \`${text}\`. Choose a shorter title to show it in full.`,
		};
		const rows = (node.rows ?? []).flatMap((row, at) => {
			const rowNamed = `${named}'s Row \`${collapseSpaces(row.name)}\``;
			return (["name", "value"] as const).flatMap((field): CheckedText[] => {
				const source = row[field];
				return source === undefined
					? []
					: [
							{
								source,
								drawn: scene?.rows[at]?.[field],
								weight: "regular",
								pointer: `/nodes/${index}/rows/${at}/${field}`,
								lacking: (some) =>
									`${rowNamed} has ${some} in its ${field} that the bundled font lacks`,
								shortened: (text) =>
									`${rowNamed} is too wide for its Node, so its ${field} is shortened to \`${text}\`. Choose a shorter name or value to show it in full.`,
							},
						];
			});
		});
		const callout: CheckedText[] =
			node.callout === undefined
				? []
				: [
						{
							source: node.callout,
							drawn: scene?.callout?.text,
							weight: "semibold",
							pointer: `/nodes/${index}/callout`,
							lacking: (some) => `${named}'s callout has ${some} that the bundled font lacks`,
							shortened: (text) =>
								`${named}'s callout is too wide for its tag, so it's shortened to \`${text}\`. Choose a shorter callout to show it in full.`,
						},
					];
		return [title, ...rows, ...callout].flatMap(warningsAbout);
	});
	return [...nodeTexts, ...groupTitles.flatMap(warningsAbout)];
}

/** A piece of text that a Node draws, and how warnings about it read. */
interface CheckedText {
	/** The text as the model gives it. */
	source: string;
	/** The text as the scene draws it. */
	drawn: SceneText | undefined;
	weight: FontWeight;
	pointer: string;
	/** The start of a warning about characters the font lacks, given `a character` or `characters`. */
	lacking: (some: string) => string;
	/** A warning that the text was shortened, given the text drawn. */
	shortened: (text: string) => string;
}

/** A warning if the text has characters that the font lacks, and one if it was shortened. */
function warningsAbout(text: CheckedText): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const missing = missingCharacters(collapseSpaces(text.source), text.weight);
	if (missing.length > 0) {
		const listed = list(missing.map((character) => `${character} (${codePointOf(character)})`));
		diagnostics.push({
			severity: "warning",
			rule: "glyph-missing",
			message:
				missing.length === 1
					? `${text.lacking("a character")}: ${listed}. It's measured at an average width, and drawn in a fallback font.`
					: `${text.lacking("characters")}: ${listed}. They're measured at an average width, and drawn in a fallback font.`,
			pointer: text.pointer,
		});
	}
	if (text.drawn?.shortened === true) {
		diagnostics.push({
			severity: "warning",
			rule: "text-shortened",
			message: text.shortened(text.drawn.text),
			pointer: text.pointer,
		});
	}
	return diagnostics;
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
export function collapseSpaces(text: string): string {
	return text.replace(/[ \t\n\r]+/g, " ").replace(/^ | $/g, "");
}

/** A text as it fits in a given width, and the width it's drawn at. */
interface Fitted {
	text: string;
	width: number;
	shortened: boolean;
}

/**
 * The text as it fits in `maxWidth`. A text that's too wide keeps the longest
 * start that fits with an ellipsis after it, leaving out spaces before the
 * ellipsis.
 */
function fit(text: string, weight: FontWeight, size: number, maxWidth: number): Fitted {
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
