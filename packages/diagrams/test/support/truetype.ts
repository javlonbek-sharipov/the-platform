/**
 * A small TrueType reader for tests, written separately from the engine's
 * own, so that tests can check fonts without trusting the code under test.
 * Every number in a font is big-endian.
 */

import { readFileSync } from "node:fs";

export interface TableEntry {
	tag: string;
	checksum: number;
	offset: number;
	length: number;
}

export interface FontFile {
	bytes: Uint8Array;
	data: DataView;
	tables: TableEntry[];
}

export function openFont(bytes: Uint8Array): FontFile {
	const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const tables: TableEntry[] = [];
	for (let index = 0; index < data.getUint16(4); index++) {
		const at = 12 + 16 * index;
		tables.push({
			tag: new TextDecoder("latin1").decode(bytes.subarray(at, at + 4)),
			checksum: data.getUint32(at + 4),
			offset: data.getUint32(at + 8),
			length: data.getUint32(at + 12),
		});
	}
	return { bytes, data, tables };
}

/** One of the bundled font files, by name, such as `Inter-SemiBold.ttf`. */
export function bundledFont(name: string): FontFile {
	return openFont(new Uint8Array(readFileSync(new URL(`../../fonts/${name}`, import.meta.url))));
}

/** Where a table starts. */
export function tableStart(font: FontFile, tag: string): number {
	const entry = font.tables.find((table) => table.tag === tag);
	if (entry === undefined) {
		throw new Error(`no ${tag} table`);
	}
	return entry.offset;
}

export function unitsPerEm(font: FontFile): number {
	return font.data.getUint16(tableStart(font, "head") + 18);
}

export function glyphCount(font: FontFile): number {
	return font.data.getUint16(tableStart(font, "maxp") + 4);
}

/** A glyph's advance width, from `hmtx`. Glyphs past the last full metric share its width. */
export function advanceOf(font: FontFile, glyph: number): number {
	const metrics = font.data.getUint16(tableStart(font, "hhea") + 34);
	return font.data.getUint16(tableStart(font, "hmtx") + 4 * Math.min(glyph, metrics - 1));
}

/**
 * Every character that a Unicode subtable of `cmap` maps to a glyph other
 * than 0, with that glyph. It reads format 4 and format 12 subtables, and
 * fails if two subtables disagree.
 */
export function characterMap(font: FontFile): Map<number, number> {
	const { data } = font;
	const cmap = tableStart(font, "cmap");
	const map = new Map<number, number>();
	const add = (code: number, glyph: number) => {
		if (glyph === 0) {
			return;
		}
		const earlier = map.get(code);
		if (earlier !== undefined && earlier !== glyph) {
			throw new Error(`cmap subtables disagree about U+${code.toString(16)}`);
		}
		map.set(code, glyph);
	};
	for (let index = 0; index < data.getUint16(cmap + 2); index++) {
		const platform = data.getUint16(cmap + 4 + 8 * index);
		const encoding = data.getUint16(cmap + 6 + 8 * index);
		const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
		const subtable = cmap + data.getUint32(cmap + 8 + 8 * index);
		const format = data.getUint16(subtable);
		if (unicode && format === 4) {
			readSegments(data, subtable, add);
		} else if (unicode && format === 12) {
			for (let group = 0; group < data.getUint32(subtable + 12); group++) {
				const at = subtable + 16 + 12 * group;
				const first = data.getUint32(at);
				for (let code = first; code <= data.getUint32(at + 4); code++) {
					add(code, data.getUint32(at + 8) + code - first);
				}
			}
		}
	}
	return map;
}

/** A format 4 subtable: segments of code points, each mapped by a delta or through an array. */
function readSegments(
	data: DataView,
	subtable: number,
	add: (code: number, glyph: number) => void,
): void {
	const segments = data.getUint16(subtable + 6) / 2;
	const ends = subtable + 14;
	const starts = ends + 2 * segments + 2;
	const deltas = starts + 2 * segments;
	const rangeOffsets = deltas + 2 * segments;
	if (data.getUint16(ends + 2 * (segments - 1)) !== 0xffff) {
		throw new Error("a format 4 cmap must end with a segment for 0xFFFF");
	}
	for (let segment = 0; segment < segments; segment++) {
		const start = data.getUint16(starts + 2 * segment);
		const delta = data.getUint16(deltas + 2 * segment);
		const rangeOffset = data.getUint16(rangeOffsets + 2 * segment);
		for (let code = start; code <= data.getUint16(ends + 2 * segment); code++) {
			if (code === 0xffff) {
				break;
			}
			if (rangeOffset === 0) {
				add(code, (code + delta) % 0x10000);
			} else {
				const at = rangeOffsets + 2 * segment + rangeOffset + 2 * (code - start);
				const glyph = data.getUint16(at);
				add(code, glyph === 0 ? 0 : (glyph + delta) % 0x10000);
			}
		}
	}
}

/** Where a glyph's data starts in the font, and how long it is, from `loca`. */
export function glyphSpan(font: FontFile, glyph: number): { start: number; length: number } {
	const long = font.data.getInt16(tableStart(font, "head") + 50) === 1;
	const loca = tableStart(font, "loca");
	const offset = (index: number) =>
		long ? font.data.getUint32(loca + 4 * index) : 2 * font.data.getUint16(loca + 2 * index);
	return {
		start: tableStart(font, "glyf") + offset(glyph),
		length: offset(glyph + 1) - offset(glyph),
	};
}

/** A glyph's header: its number of contours (negative for a composite) and its bounding box. */
export function glyphHeader(font: FontFile, glyph: number): number[] {
	const { start, length } = glyphSpan(font, glyph);
	if (length === 0) {
		return [];
	}
	return [0, 2, 4, 6, 8].map((at) => font.data.getInt16(start + at));
}

/** The glyphs that a composite glyph is built from. */
export function componentsOf(font: FontFile, glyph: number): number[] {
	const { start, length } = glyphSpan(font, glyph);
	if (length === 0 || font.data.getInt16(start) >= 0) {
		return [];
	}
	const components: number[] = [];
	let at = start + 10;
	for (;;) {
		const flags = font.data.getUint16(at);
		components.push(font.data.getUint16(at + 2));
		at += 4 + (flags & 0x0001 ? 4 : 2);
		at += flags & 0x0008 ? 2 : flags & 0x0040 ? 4 : flags & 0x0080 ? 8 : 0;
		if (!(flags & 0x0020)) {
			return components;
		}
	}
}

const requiredTables = [
	"OS/2",
	"cmap",
	"glyf",
	"head",
	"hhea",
	"hmtx",
	"loca",
	"maxp",
	"name",
	"post",
];

/**
 * What's wrong with a font, measured against the OpenType specification and
 * what browsers' font sanitizers check: the table directory, checksums,
 * `loca`, components, `hmtx`, `post` and `cmap`. Empty for a good font.
 */
export function fontProblems(font: FontFile): string[] {
	const { bytes, data, tables } = font;
	const problems: string[] = [];
	const check = (ok: boolean, problem: string) => {
		if (!ok) {
			problems.push(problem);
		}
	};
	const sum = (start: number, length: number) => {
		let total = 0;
		for (let at = start; at < start + length; at += 4) {
			const word = [0, 1, 2, 3].map((byte) =>
				at + byte < start + length ? (bytes[at + byte] ?? 0) : 0,
			);
			total =
				(total +
					((word[0] ?? 0) * 2 ** 24 +
						(word[1] ?? 0) * 2 ** 16 +
						(word[2] ?? 0) * 2 ** 8 +
						(word[3] ?? 0))) %
				2 ** 32;
		}
		return total;
	};

	check(data.getUint32(0) === 0x00010000, "the sfnt version isn't 1.0");
	const count = tables.length;
	const searchRange = 16 * 2 ** Math.floor(Math.log2(count));
	check(data.getUint16(6) === searchRange, "searchRange is wrong");
	check(data.getUint16(8) === Math.floor(Math.log2(count)), "entrySelector is wrong");
	check(data.getUint16(10) === count * 16 - searchRange, "rangeShift is wrong");
	const tags = tables.map((table) => table.tag);
	check(tags.join() === [...tags].sort().join(), "the tables aren't sorted by tag");
	for (const tag of requiredTables) {
		check(tags.includes(tag), `the ${tag} table is missing`);
	}
	const spans = [...tables].sort((a, b) => a.offset - b.offset);
	let end = 12 + 16 * count;
	for (const table of spans) {
		check(table.offset % 4 === 0, `the ${table.tag} table isn't 4-byte aligned`);
		check(table.length > 0, `the ${table.tag} table is empty`);
		check(table.offset >= end, `the ${table.tag} table overlaps the one before it`);
		check(
			table.offset + table.length <= bytes.byteLength,
			`the ${table.tag} table runs past the end`,
		);
		end = table.offset + table.length;
		const adjustment = table.tag === "head" ? data.getUint32(table.offset + 8) : 0;
		const checksum = (sum(table.offset, table.length) - adjustment + 2 ** 32) % 2 ** 32;
		check(checksum === table.checksum, `the ${table.tag} table's checksum is wrong`);
	}
	check(sum(0, bytes.byteLength) === 0xb1b0afba, "head.checkSumAdjustment is wrong");
	if (problems.length > 0) {
		return problems;
	}

	const glyphs = glyphCount(font);
	const glyf = tables.find((table) => table.tag === "glyf");
	let previous = 0;
	for (let glyph = 0; glyph < glyphs; glyph++) {
		const { start, length } = glyphSpan(font, glyph);
		check(
			start - tableStart(font, "glyf") >= previous && length >= 0,
			`loca is out of order at glyph ${glyph}`,
		);
		check(
			start + length <= (glyf?.offset ?? 0) + (glyf?.length ?? 0),
			`glyph ${glyph} runs past glyf`,
		);
		previous = start - tableStart(font, "glyf");
		for (const component of componentsOf(font, glyph)) {
			check(component < glyphs, `glyph ${glyph} uses glyph ${component}, which doesn't exist`);
		}
	}
	const metrics = data.getUint16(tableStart(font, "hhea") + 34);
	const hmtx = tables.find((table) => table.tag === "hmtx");
	check(metrics >= 1 && metrics <= glyphs, "hhea.numberOfHMetrics is out of range");
	check(hmtx?.length === 4 * metrics + 2 * (glyphs - metrics), "hmtx has the wrong length");
	const post = data.getUint32(tableStart(font, "post"));
	check([0x00010000, 0x00020000, 0x00030000].includes(post), "post has an unknown version");
	if (post === 0x00020000) {
		check(
			data.getUint16(tableStart(font, "post") + 32) === glyphs,
			"post names the wrong number of glyphs",
		);
	}
	for (const [code, glyph] of characterMap(font)) {
		check(
			glyph < glyphs,
			`cmap maps U+${code.toString(16)} to glyph ${glyph}, which doesn't exist`,
		);
	}
	return problems;
}
