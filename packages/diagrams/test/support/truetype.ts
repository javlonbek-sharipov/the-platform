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
