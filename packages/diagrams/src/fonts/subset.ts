/**
 * Our own TrueType subsetter, written from the OpenType specification 1.9.1.
 *
 * A subset keeps `.notdef`, the glyphs of the characters asked for, and the
 * glyphs those are built from, in the font's own order. It keeps only the
 * tables a browser needs to draw them, so it has no hinting, and no layout
 * tables: it can't kern or form ligatures, just as the core measures text.
 *
 * The bytes depend only on the font and the characters. Tables are written
 * in tag order, and `head` keeps the font's own timestamps.
 */

import { type TrueTypeFont, tableOf, view } from "./truetype.ts";

/** Composite glyph flags, from the `glyf` table's specification. */
const argumentsAreWords = 0x0001;
const haveScale = 0x0008;
const moreComponents = 0x0020;
const haveXAndYScale = 0x0040;
const haveTwoByTwo = 0x0080;
const haveInstructions = 0x0100;

/** Simple glyph flags. */
const xShort = 0x02;
const yShort = 0x04;
const repeat = 0x08;
const xSameOrPositive = 0x10;
const ySameOrPositive = 0x20;

export function subsetFont(font: TrueTypeFont, characters: string): Uint8Array {
	const mapped = new Map<number, number>();
	for (const character of characters) {
		const code = character.codePointAt(0) ?? 0;
		const glyph = font.characters.get(code);
		if (glyph !== undefined) {
			mapped.set(code, glyph);
		}
	}

	const kept = new Set<number>();
	const pending = [0, ...mapped.values()];
	for (let glyph = pending.pop(); glyph !== undefined; glyph = pending.pop()) {
		if (!kept.has(glyph)) {
			kept.add(glyph);
			pending.push(...components(font.glyphData(glyph)).map((component) => component.glyph));
		}
	}
	const glyphs = [...kept].sort((a, b) => a - b);
	const newIds = new Map(glyphs.map((glyph, index) => [glyph, index]));
	const newCharacters = [...mapped]
		.map(([code, glyph]): [number, number] => [code, newIds.get(glyph) ?? 0])
		.sort(([a], [b]) => a - b);

	const { glyf, loca } = glyphTables(font, glyphs, newIds);
	return assemble(
		new Map([
			["OS/2", os2Table(font, newCharacters)],
			["cmap", cmapTable(newCharacters)],
			["glyf", glyf],
			["head", headTable(font)],
			["hhea", hheaTable(font, glyphs.length)],
			["hmtx", hmtxTable(font, glyphs)],
			["loca", loca],
			["maxp", maxpTable(font, glyphs.length)],
			["name", nameTable(font)],
			["post", postTable(font)],
		]),
	);
}

/** Writes numbers big-endian into a growing buffer. */
class Writer {
	private bytes = new Uint8Array(256);
	private data = view(this.bytes);
	length = 0;

	uint8(value: number): void {
		this.reserve(1);
		this.data.setUint8(this.length, value);
		this.length += 1;
	}

	uint16(value: number): void {
		this.reserve(2);
		this.data.setUint16(this.length, value);
		this.length += 2;
	}

	int16(value: number): void {
		this.reserve(2);
		this.data.setInt16(this.length, value);
		this.length += 2;
	}

	uint32(value: number): void {
		this.reserve(4);
		this.data.setUint32(this.length, value);
		this.length += 4;
	}

	append(bytes: Uint8Array): void {
		this.reserve(bytes.byteLength);
		this.bytes.set(bytes, this.length);
		this.length += bytes.byteLength;
	}

	/** Zeros up to the next multiple of four bytes. */
	pad(): void {
		while (this.length % 4 !== 0) {
			this.uint8(0);
		}
	}

	done(): Uint8Array {
		return this.bytes.slice(0, this.length);
	}

	private reserve(count: number): void {
		if (this.length + count > this.bytes.byteLength) {
			const bigger = new Uint8Array(Math.max(this.bytes.byteLength * 2, this.length + count));
			bigger.set(this.bytes);
			this.bytes = bigger;
			this.data = view(bigger);
		}
	}
}

interface Component {
	/** Where its glyph index sits in the glyph's data. */
	at: number;
	glyph: number;
}

/** The components of a composite glyph, or none for a simple or empty glyph. */
function components(data: Uint8Array): Component[] {
	if (data.byteLength === 0 || view(data).getInt16(0) >= 0) {
		return [];
	}
	const glyph = view(data);
	const found: Component[] = [];
	let at = 10;
	for (;;) {
		const flags = glyph.getUint16(at);
		found.push({ at: at + 2, glyph: glyph.getUint16(at + 2) });
		at += 4 + (flags & argumentsAreWords ? 4 : 2);
		at += flags & haveScale ? 2 : flags & haveXAndYScale ? 4 : flags & haveTwoByTwo ? 8 : 0;
		if (!(flags & moreComponents)) {
			return found;
		}
	}
}

/** `glyf` and `loca`, in the long format, with every glyph's instructions left out. */
function glyphTables(
	font: TrueTypeFont,
	glyphs: number[],
	newIds: Map<number, number>,
): { glyf: Uint8Array; loca: Uint8Array } {
	const glyf = new Writer();
	const loca = new Writer();
	for (const glyph of glyphs) {
		loca.uint32(glyf.length);
		const data = font.glyphData(glyph);
		if (data.byteLength > 0) {
			glyf.append(view(data).getInt16(0) >= 0 ? simpleGlyph(data) : compositeGlyph(data, newIds));
			glyf.pad();
		}
	}
	loca.uint32(glyf.length);
	return { glyf: glyf.done(), loca: loca.done() };
}

/** A simple glyph without its instructions: its header, contour ends, flags and coordinates. */
function simpleGlyph(data: Uint8Array): Uint8Array {
	const glyph = view(data);
	const contourEnds = 10 + 2 * glyph.getInt16(0);
	const points = contourEnds === 10 ? 0 : glyph.getUint16(contourEnds - 2) + 1;
	const flagsStart = contourEnds + 2 + glyph.getUint16(contourEnds);
	let at = flagsStart;
	let coordinates = 0;
	for (let point = 0; point < points; ) {
		const flags = glyph.getUint8(at);
		const count = flags & repeat ? glyph.getUint8(at + 1) + 1 : 1;
		at += flags & repeat ? 2 : 1;
		coordinates += count * (flags & xShort ? 1 : flags & xSameOrPositive ? 0 : 2);
		coordinates += count * (flags & yShort ? 1 : flags & ySameOrPositive ? 0 : 2);
		point += count;
	}
	const end = at + coordinates;
	if (end > data.byteLength) {
		throw new Error("A glyph's coordinates run past the end of its data.");
	}
	const out = new Writer();
	out.append(data.subarray(0, contourEnds));
	out.uint16(0);
	out.append(data.subarray(flagsStart, end));
	return out.done();
}

/** A composite glyph with its components renumbered, and without its instructions. */
function compositeGlyph(data: Uint8Array, newIds: Map<number, number>): Uint8Array {
	const found = components(data);
	const last = found[found.length - 1];
	const glyph = view(data);
	// The last component's record ends where its instructions, if any, begin.
	const lastFlags = glyph.getUint16((last?.at ?? 12) - 2);
	let end = (last?.at ?? 12) + 2 + (lastFlags & argumentsAreWords ? 4 : 2);
	end +=
		lastFlags & haveScale ? 2 : lastFlags & haveXAndYScale ? 4 : lastFlags & haveTwoByTwo ? 8 : 0;
	const out = data.slice(0, end);
	const rewritten = view(out);
	for (const component of found) {
		const flags = rewritten.getUint16(component.at - 2);
		rewritten.setUint16(component.at - 2, flags & ~haveInstructions);
		rewritten.setUint16(component.at, newIds.get(component.glyph) ?? 0);
	}
	return out;
}

/** Every glyph gets a full metric, so `numberOfHMetrics` is the glyph count. */
function hmtxTable(font: TrueTypeFont, glyphs: number[]): Uint8Array {
	const out = new Writer();
	for (const glyph of glyphs) {
		out.uint16(font.advanceWidth(glyph));
		out.int16(font.leftSideBearing(glyph));
	}
	return out.done();
}

function hheaTable(font: TrueTypeFont, glyphCount: number): Uint8Array {
	const hhea = copyOf(font, "hhea");
	view(hhea).setUint16(34, glyphCount);
	return hhea;
}

function maxpTable(font: TrueTypeFont, glyphCount: number): Uint8Array {
	const maxp = copyOf(font, "maxp");
	view(maxp).setUint16(4, glyphCount);
	return maxp;
}

/** `head` with long `loca` offsets, and a checksum adjustment of zero until the font is assembled. */
function headTable(font: TrueTypeFont): Uint8Array {
	const head = copyOf(font, "head");
	view(head).setUint32(8, 0);
	view(head).setInt16(50, 1);
	return head;
}

/** `OS/2` with the subset's first and last characters, and no layout context, since there are no layout tables. */
function os2Table(font: TrueTypeFont, characters: [number, number][]): Uint8Array {
	const os2 = copyOf(font, "OS/2");
	const data = view(os2);
	const codes = characters.map(([code]) => code);
	data.setUint16(64, Math.min(codes[0] ?? 0, 0xffff));
	data.setUint16(66, Math.min(codes[codes.length - 1] ?? 0, 0xffff));
	if (data.getUint16(0) >= 2) {
		data.setUint16(94, 0);
	}
	return os2;
}

/** `name` without the names of the layout features that the subset leaves out (IDs 256 and up). */
function nameTable(font: TrueTypeFont): Uint8Array {
	const name = font.tables.get("name") ?? new Uint8Array();
	const data = view(name);
	if (data.getUint16(0) !== 0) {
		throw new Error("This subsetter reads only format 0 `name` tables.");
	}
	const storage = data.getUint16(4);
	const records: { fields: number[]; text: Uint8Array }[] = [];
	for (let index = 0; index < data.getUint16(2); index++) {
		const at = 6 + 12 * index;
		const fields = [0, 2, 4, 6].map((field) => data.getUint16(at + field));
		const length = data.getUint16(at + 8);
		const offset = storage + data.getUint16(at + 10);
		if ((fields[3] ?? 0) < 256) {
			records.push({ fields, text: name.subarray(offset, offset + length) });
		}
	}
	const out = new Writer();
	out.uint16(0);
	out.uint16(records.length);
	out.uint16(6 + 12 * records.length);
	let offset = 0;
	for (const { fields, text } of records) {
		for (const field of fields) {
			out.uint16(field);
		}
		out.uint16(text.byteLength);
		out.uint16(offset);
		offset += text.byteLength;
	}
	for (const { text } of records) {
		out.append(text);
	}
	return out.done();
}

/** `post` version 3, which names no glyphs. */
function postTable(font: TrueTypeFont): Uint8Array {
	const post = copyOf(font, "post").slice(0, 32);
	view(post).setUint32(0, 0x00030000);
	return post;
}

/**
 * Format 4 for the Basic Multilingual Plane, under both Unicode encoding
 * records that browsers read, and format 12 as well when a character lies
 * beyond it.
 */
function cmapTable(characters: [number, number][]): Uint8Array {
	const basic = characters.filter(([code]) => code < 0xffff);
	const format4 = format4Subtable(basic);
	const format12 = basic.length < characters.length ? format12Subtable(characters) : undefined;
	const records: [platform: number, encoding: number, subtable: Uint8Array][] =
		format12 === undefined
			? [
					[0, 3, format4],
					[3, 1, format4],
				]
			: [
					[0, 3, format4],
					[0, 4, format12],
					[3, 1, format4],
					[3, 10, format12],
				];
	const out = new Writer();
	out.uint16(0);
	out.uint16(records.length);
	const format4Offset = 4 + 8 * records.length;
	const format12Offset = format4Offset + format4.byteLength;
	for (const [platform, encoding, subtable] of records) {
		out.uint16(platform);
		out.uint16(encoding);
		out.uint32(subtable === format4 ? format4Offset : format12Offset);
	}
	out.append(format4);
	if (format12 !== undefined) {
		out.append(format12);
	}
	return out.done();
}

/** Runs of consecutive characters that map to consecutive glyphs. */
function runsOf(characters: [number, number][]): { start: number; end: number; glyph: number }[] {
	const runs: { start: number; end: number; glyph: number }[] = [];
	for (const [code, glyph] of characters) {
		const run = runs[runs.length - 1];
		if (run !== undefined && code === run.end + 1 && glyph === run.glyph + (code - run.start)) {
			run.end = code;
		} else {
			runs.push({ start: code, end: code, glyph });
		}
	}
	return runs;
}

function format4Subtable(characters: [number, number][]): Uint8Array {
	// Each run maps by a delta; the last segment, for 0xFFFF, maps to glyph 0.
	const segments = [
		...runsOf(characters).map(({ start, end, glyph }) => ({ start, end, delta: glyph - start })),
		{ start: 0xffff, end: 0xffff, delta: 1 },
	];
	const entrySelector = Math.floor(Math.log2(segments.length));
	const searchRange = 2 * 2 ** entrySelector;
	const out = new Writer();
	out.uint16(4);
	out.uint16(16 + 8 * segments.length);
	out.uint16(0);
	out.uint16(2 * segments.length);
	out.uint16(searchRange);
	out.uint16(entrySelector);
	out.uint16(2 * segments.length - searchRange);
	for (const segment of segments) {
		out.uint16(segment.end);
	}
	out.uint16(0);
	for (const segment of segments) {
		out.uint16(segment.start);
	}
	for (const segment of segments) {
		out.uint16((segment.delta + 0x10000) % 0x10000);
	}
	for (let index = 0; index < segments.length; index++) {
		out.uint16(0);
	}
	return out.done();
}

function format12Subtable(characters: [number, number][]): Uint8Array {
	const runs = runsOf(characters);
	const out = new Writer();
	out.uint16(12);
	out.uint16(0);
	out.uint32(16 + 12 * runs.length);
	out.uint32(0);
	out.uint32(runs.length);
	for (const { start, end, glyph } of runs) {
		out.uint32(start);
		out.uint32(end);
		out.uint32(glyph);
	}
	return out.done();
}

/**
 * The font file: the table directory, then each table on a four-byte
 * boundary, in tag order. Then `head.checkSumAdjustment` makes the whole
 * file's checksum 0xB1B0AFBA.
 */
function assemble(tables: Map<string, Uint8Array>): Uint8Array {
	const tags = [...tables.keys()].sort();
	const entrySelector = Math.floor(Math.log2(tags.length));
	const searchRange = 16 * 2 ** entrySelector;
	const out = new Writer();
	out.uint32(0x00010000);
	out.uint16(tags.length);
	out.uint16(searchRange);
	out.uint16(entrySelector);
	out.uint16(16 * tags.length - searchRange);
	let offset = 12 + 16 * tags.length;
	for (const tag of tags) {
		const table = tables.get(tag) ?? new Uint8Array();
		for (const character of tag) {
			out.uint8(character.charCodeAt(0));
		}
		out.uint32(checksum(table));
		out.uint32(offset);
		out.uint32(table.byteLength);
		offset += table.byteLength + ((4 - (table.byteLength % 4)) % 4);
	}
	let headAt = 0;
	for (const tag of tags) {
		if (tag === "head") {
			headAt = out.length;
		}
		out.append(tables.get(tag) ?? new Uint8Array());
		out.pad();
	}
	const font = out.done();
	view(font).setUint32(headAt + 8, (0xb1b0afba - checksum(font) + 2 ** 32) % 2 ** 32);
	return font;
}

/** The sum of a table's bytes as big-endian 32-bit words, with zeros after the last, kept to 32 bits. */
function checksum(bytes: Uint8Array): number {
	const padded = new Uint8Array(bytes.byteLength + ((4 - (bytes.byteLength % 4)) % 4));
	padded.set(bytes);
	const data = view(padded);
	let sum = 0;
	for (let at = 0; at < padded.byteLength; at += 4) {
		sum = (sum + data.getUint32(at)) % 2 ** 32;
	}
	return sum;
}

function copyOf(font: TrueTypeFont, tag: string): Uint8Array {
	return tableOf(font.tables, tag).slice();
}
