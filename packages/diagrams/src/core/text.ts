/**
 * Measuring text with metrics generated from the bundled Inter fonts, so that
 * layout needs no font file, and Node and browsers measure alike. Measuring
 * ignores kerning and ligatures, and the SVG turns both off, so drawn text
 * matches measured text.
 */

import type { Diagram, Row } from "../authoring/model.ts";
import { technologyOf } from "../notations/architecture.ts";
import { codePointOf, type Diagnostic, list } from "./diagnostics.ts";
import { fontMetrics } from "./font-metrics.ts";
import type {
	Box,
	Scene,
	SceneEdge,
	SceneGroup,
	SceneLogo,
	SceneNode,
	SceneText,
} from "./scene.ts";
import { type ModelText, textsOf } from "./texts.ts";

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
/** The size of a Node's Technology's name, below its title. */
const technologySize = 11;
/**
 * How far a Node's title rises above its header's middle, and its
 * Technology's name drops below it, when it has a Technology, so that the
 * two lines are centered together.
 */
const titleRise = 7;
const technologyDrop = 8;
const groupTitleSize = 13;
/** The room a Group's title leaves on each side, between it and the edge of its label box. */
export const groupLabelPadding = 12;
const calloutSize = 11;
const rowSize = 12;
/** The room a Row leaves on each side, between its text and the edge of its Node. */
const rowPadding = 12;
/** The least room between a Row's name and its value. */
const rowGap = 8;
const ellipsis = "…";

/**
 * A Node's title, centered across the room its header leaves for it, level
 * with the header's `middle`, and shortened if it's too wide for the room.
 *
 * When the Node has a Technology, the Technology's name goes below the
 * title, smaller, and the title rises to make room for it. But the title
 * rises no higher than the room's top, where the outline's face starts below
 * a lid or a title bar.
 */
export function headerTexts(
	title: string,
	technology: string | undefined,
	room: Box,
	middle: number,
): { title: SceneText; technology?: SceneText } {
	const x = room.x + room.width / 2;
	const titleY =
		technology === undefined ? middle : Math.max(middle - titleRise, room.y + titleSize / 2);
	const titleText: SceneText = {
		...fit(collapseSpaces(title), "semibold", titleSize, room.width),
		point: { x, y: titleY },
		weight: "semibold",
		size: titleSize,
	};
	return technology === undefined
		? { title: titleText }
		: {
				title: titleText,
				technology: {
					...fit(technology, "regular", technologySize, room.width),
					point: { x, y: titleY + titleRise + technologyDrop },
					weight: "regular",
					size: technologySize,
				},
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
		band.width - 2 * groupLabelPadding,
	);
	return {
		...fitted,
		point: { x: band.x + groupLabelPadding + fitted.width / 2, y: band.y + band.height / 2 },
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
	const [fittedName, fittedValue] = sideBySide(name, value, rowSize, room, rowGap);
	return {
		name: text(fittedName, left + fittedName.width / 2),
		value: text(fittedValue, right - fittedValue.width / 2),
	};
}

/**
 * Two texts side by side in the regular weight, in `room`, at least `gap`
 * apart. When they don't both fit, the first is shortened first, as far as
 * its first character and an ellipsis, and only then the second, to the room
 * left beside that.
 */
function sideBySide(
	first: string,
	second: string,
	size: number,
	room: number,
	gap: number,
): [Fitted, Fitted] {
	const shortest = fit(
		first,
		"regular",
		size,
		widthOf(`${[...first][0] ?? ""}${ellipsis}`, "regular", size),
	);
	const fittedSecond = fit(second, "regular", size, room - gap - shortest.width);
	const fittedFirst = fittedSecond.shortened
		? shortest
		: fit(first, "regular", size, room - gap - fittedSecond.width);
	return [fittedFirst, fittedSecond];
}

/** A text's width: its characters' advance widths, summed. */
function widthOf(text: string, weight: FontWeight, size: number): number {
	const units = [...text].reduce((sum, character) => sum + unitsOf(character, weight), 0);
	return (units * size) / metrics[weight].unitsPerEm;
}

/**
 * What an Edge's label shows: its own text, and its Technology and rate below
 * it. The Technology shows as its name, after its logo if it has one.
 */
export interface LabelContent {
	text?: string;
	technology?: LabelTechnology;
	rate?: string;
}

/** A Technology as a label shows it: by its name, after its logo when the logo table has one. */
export interface LabelTechnology {
	slug: string;
	/** Its display name, or its slug when it has no logo. */
	name: string;
	logo: boolean;
}

/** The size of a label's own text, and of the Technology and rate below it. */
const labelTextSize = 12;
const labelDetailSize = 11;
/** The height of the line that each takes. */
const labelTextLine = 16;
const labelDetailLine = 14;
/** The room a label's box leaves around its texts. */
const labelPaddingX = 4;
const labelPaddingY = 2;
/** The room between the Technology and the rate. */
const labelSeparation = 12;
/** A logo in a label: a square that fits the Technology's line, and the room after it. */
const labelLogoSize = 12;
const labelLogoGap = 4;
/**
 * The widest a label's texts are drawn. A gap between ranks leaves no more
 * room for a label than this, so a longer label is too long for any run.
 */
const widestLabel = 192;

/** The size of a label's box when its texts are no wider than `width`. */
export function labelBoxSize(
	content: LabelContent,
	width: number,
): { width: number; height: number } {
	const detail = content.technology !== undefined || content.rate !== undefined;
	return {
		width: width + 2 * labelPaddingX,
		height:
			2 * labelPaddingY +
			(content.text === undefined ? 0 : labelTextLine) +
			(detail ? labelDetailLine : 0),
	};
}

/**
 * How wide a label's texts are drawn, where there's room: as wide as its own
 * text, or its Technology, with its logo, and its rate side by side, but no
 * wider than the widest a label is drawn.
 */
export function labelWidth(content: LabelContent): number {
	const text =
		content.text === undefined
			? 0
			: widthOf(collapseSpaces(content.text), "regular", labelTextSize);
	const technology =
		content.technology === undefined
			? 0
			: logoRoom(content.technology) + widthOf(content.technology.name, "regular", labelDetailSize);
	const rate = content.rate === undefined ? 0 : widthOf(content.rate, "regular", labelDetailSize);
	const separation = technology > 0 && rate > 0 ? labelSeparation : 0;
	return Math.min(widestLabel, Math.max(text, technology + separation + rate));
}

/** The room a label's logo takes before the Technology's name, with the gap after it. */
function logoRoom(technology: LabelTechnology | undefined): number {
	return technology?.logo === true ? labelLogoSize + labelLogoGap : 0;
}

/**
 * A label's texts, laid out in its box: its own text centered on the first
 * line, and its Technology and rate centered together on the line below, with
 * the Technology's logo before its name. A text too wide for the box is
 * shortened. When the Technology and the rate don't fit side by side, the
 * Technology is shortened first, as a Row's name is before its value, and its
 * logo stays.
 */
export function labelTexts(
	content: LabelContent,
	box: Box,
): { text?: SceneText; technology?: SceneText; logo?: SceneLogo; rate?: SceneText } {
	const room = box.width - 2 * labelPaddingX;
	const middle = box.x + box.width / 2;
	const top = box.y + labelPaddingY;
	const placed = (fitted: Fitted, x: number, y: number, size: number): SceneText => ({
		...fitted,
		point: { x, y },
		weight: "regular",
		size,
	});
	const text =
		content.text === undefined
			? undefined
			: placed(
					fit(collapseSpaces(content.text), "regular", labelTextSize, room),
					middle,
					top + labelTextLine / 2,
					labelTextSize,
				);
	const detailY = top + (text === undefined ? 0 : labelTextLine) + labelDetailLine / 2;
	const logo = logoRoom(content.technology);
	const [technology, rate] =
		content.technology !== undefined && content.rate !== undefined
			? sideBySide(
					content.technology.name,
					content.rate,
					labelDetailSize,
					room - logo,
					labelSeparation,
				)
			: [
					content.technology === undefined
						? undefined
						: fit(content.technology.name, "regular", labelDetailSize, room - logo),
					content.rate === undefined
						? undefined
						: fit(content.rate, "regular", labelDetailSize, room),
				];
	const separation = technology !== undefined && rate !== undefined ? labelSeparation : 0;
	const left = middle - (logo + (technology?.width ?? 0) + separation + (rate?.width ?? 0)) / 2;
	return {
		...(text === undefined ? {} : { text }),
		...(technology === undefined
			? {}
			: {
					technology: placed(
						technology,
						left + logo + technology.width / 2,
						detailY,
						labelDetailSize,
					),
				}),
		...(content.technology?.logo === true
			? {
					logo: {
						technology: content.technology.slug,
						box: {
							x: left,
							y: detailY - labelLogoSize / 2,
							width: labelLogoSize,
							height: labelLogoSize,
						},
					},
				}
			: {}),
		...(rate === undefined
			? {}
			: {
					rate: placed(
						rate,
						left + logo + (technology?.width ?? 0) + separation + rate.width / 2,
						detailY,
						labelDetailSize,
					),
				}),
	};
}

/** Every piece of text the scene draws: each Node's, then each Group's title, then each label's. */
export function drawnTexts(scene: Scene): SceneText[] {
	return [
		...scene.nodes.flatMap((node) => [
			node.title,
			...(node.technology === undefined ? [] : [node.technology]),
			...rowTextsOf(node),
			...(node.callout === undefined ? [] : [node.callout.text]),
		]),
		...scene.groups.map((group) => group.title),
		...scene.edges.flatMap(({ label }) =>
			label === undefined
				? []
				: [label.text, label.technology, label.rate].flatMap((text) =>
						text === undefined ? [] : [text],
					),
		),
	];
}

/** Each Row's name, and its value if it has one, in order. */
export function rowTextsOf(node: SceneNode): SceneText[] {
	return node.rows.flatMap((row) => (row.value === undefined ? [row.name] : [row.name, row.value]));
}

/**
 * A warning for each piece of text with characters that the font lacks, and
 * for each one shortened: every Node's title, Technology, Rows' names and
 * values, and callout, then every Group's title, then every Edge's label,
 * Technology and rate, as the model holds them.
 */
export function textDiagnostics(
	diagram: Diagram,
	nodes: SceneNode[],
	groups: SceneGroup[],
	edges: SceneEdge[],
): Diagnostic[] {
	// The scene keeps the model's order.
	return textsOf(diagram).flatMap((text) => {
		const checked = checkedText(text, nodes, groups, edges);
		return checked === undefined ? [] : warningsAbout(checked);
	});
}

/** A text of the model that the scene draws, as its warnings check and word it; none for one it doesn't draw. */
function checkedText(
	{ owner, field, text, pointer }: ModelText,
	nodes: SceneNode[],
	groups: SceneGroup[],
	edges: SceneEdge[],
): CheckedText | undefined {
	if (owner.thing === "Diagram") {
		return undefined;
	}
	const named = `${owner.thing} \`${owner.id}\``;
	const node = owner.thing === "Node" ? nodes[owner.index] : undefined;
	const label = owner.thing === "Edge" ? edges[owner.index]?.label : undefined;
	switch (field.name) {
		case "title":
			return owner.thing === "Edge"
				? undefined
				: {
						source: text,
						drawn: owner.thing === "Node" ? node?.title : groups[owner.index]?.title,
						weight: "semibold",
						pointer,
						lacking: (some) => `${named}'s title has ${some} that the bundled font lacks`,
						shortened: (drawn) =>
							`${named}'s title is too wide for its ${owner.thing}, so it's shortened to \`${drawn}\`. Choose a shorter title to show it in full.`,
					};
		case "technology":
			return {
				...technologyText(
					named,
					technologyOf(text),
					owner.thing === "Node" ? "too wide for its Node" : "too long for its run",
				),
				drawn: owner.thing === "Node" ? node?.technology : label?.technology,
				pointer,
			};
		case "row name":
		case "row value": {
			const part = field.name === "row name" ? "name" : "value";
			const rowNamed = `${named}'s Row \`${collapseSpaces(field.row)}\``;
			return {
				source: text,
				drawn: node?.rows[field.rowIndex]?.[part],
				weight: "regular",
				pointer,
				lacking: (some) => `${rowNamed} has ${some} in its ${part} that the bundled font lacks`,
				shortened: (drawn) =>
					`${rowNamed} is too wide for its Node, so its ${part} is shortened to \`${drawn}\`. Choose a shorter name or value to show it in full.`,
			};
		}
		case "callout":
			return {
				source: text,
				drawn: node?.callout?.text,
				weight: "semibold",
				pointer,
				lacking: (some) => `${named}'s callout has ${some} that the bundled font lacks`,
				shortened: (drawn) =>
					`${named}'s callout is too wide for its tag, so it's shortened to \`${drawn}\`. Choose a shorter callout to show it in full.`,
			};
		case "label":
		case "rate": {
			const advice =
				field.name === "label"
					? "Choose a shorter label to show it in full."
					: "Write it with `k` or `M` to show it in full.";
			return {
				source: text,
				drawn: field.name === "label" ? label?.text : label?.rate,
				weight: "regular",
				pointer,
				lacking: (some) => `${named}'s ${field.name} has ${some} that the bundled font lacks`,
				shortened: (drawn) =>
					`${named}'s ${field.name} is too long for its run, so it's shortened to \`${drawn}\`. ${advice}`,
			};
		}
		default:
			return undefined;
	}
}

/**
 * How warnings about a Technology's name read, for a Node or an Edge: a slug
 * without a logo can be shortened by its author, but a logo's name can't.
 */
function technologyText(
	named: string,
	technology: { name: string; logo?: string },
	tooWide: string,
): Pick<CheckedText, "source" | "weight" | "lacking" | "shortened"> {
	return {
		source: technology.name,
		weight: "regular",
		lacking: (some) => `${named}'s Technology has ${some} that the bundled font lacks`,
		shortened: (text) =>
			technology.logo === undefined
				? `${named}'s Technology is ${tooWide}, so it's shortened to \`${text}\`. Choose a shorter slug to show it in full.`
				: `${named}'s Technology is ${tooWide}, so its name is shortened to \`${text}\`. Its logo still shows which Technology it is.`,
	};
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
