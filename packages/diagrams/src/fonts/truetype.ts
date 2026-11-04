/**
 * Reads the parts of a TrueType font that the engine needs: its tables, its
 * character map, its horizontal metrics and its glyph data. Written from the
 * OpenType specification, version 1.9.1.
 */

export interface TrueTypeFont {
	/** Each table's bytes, by tag. */
	tables: ReadonlyMap<string, Uint8Array>;
	unitsPerEm: number;
	numGlyphs: number;
	/** The glyph that the font maps each character to, by code point. */
	characters: ReadonlyMap<number, number>;
	advanceWidth(glyph: number): number;
	leftSideBearing(glyph: number): number;
	/** A glyph's outline data from `glyf`. Empty for a glyph with no outline, such as a space. */
	glyphData(glyph: number): Uint8Array;
}

export function readTrueType(bytes: Uint8Array): TrueTypeFont {
	const tables = readTables(bytes);
	const table = (tag: string) => {
		const found = tables.get(tag);
		if (found === undefined) {
			throw new Error(`The font has no \`${tag}\` table.`);
		}
		return found;
	};

	const head = view(table("head"));
	const unitsPerEm = head.getUint16(18);
	const longOffsets = head.getInt16(50) === 1;
	const numGlyphs = view(table("maxp")).getUint16(4);
	const numberOfHMetrics = view(table("hhea")).getUint16(34);
	const hmtx = view(table("hmtx"));
	const loca = view(table("loca"));
	const glyf = table("glyf");

	const checkGlyph = (glyph: number) => {
		if (!Number.isInteger(glyph) || glyph < 0 || glyph >= numGlyphs) {
			throw new Error(`The font has no glyph ${glyph}.`);
		}
	};
	const glyphOffset = (glyph: number) =>
		longOffsets ? loca.getUint32(glyph * 4) : loca.getUint16(glyph * 2) * 2;

	return {
		tables,
		unitsPerEm,
		numGlyphs,
		characters: readCharacterMap(table("cmap")),
		advanceWidth(glyph) {
			checkGlyph(glyph);
			return hmtx.getUint16(Math.min(glyph, numberOfHMetrics - 1) * 4);
		},
		leftSideBearing(glyph) {
			checkGlyph(glyph);
			return glyph < numberOfHMetrics
				? hmtx.getInt16(glyph * 4 + 2)
				: hmtx.getInt16(numberOfHMetrics * 4 + (glyph - numberOfHMetrics) * 2);
		},
		glyphData(glyph) {
			checkGlyph(glyph);
			return glyf.subarray(glyphOffset(glyph), glyphOffset(glyph + 1));
		},
	};
}

/** A big-endian view of some bytes, as every number in a font is. */
export function view(bytes: Uint8Array): DataView {
	return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function readTables(bytes: Uint8Array): Map<string, Uint8Array> {
	const data = view(bytes);
	const version = data.getUint32(0);
	if (version !== 0x00010000 && version !== 0x74727565) {
		throw new Error("The font isn't a TrueType font.");
	}
	const tables = new Map<string, Uint8Array>();
	const numTables = data.getUint16(4);
	for (let index = 0; index < numTables; index++) {
		const record = 12 + index * 16;
		const tag = String.fromCharCode(...bytes.subarray(record, record + 4));
		const offset = data.getUint32(record + 8);
		const length = data.getUint32(record + 12);
		if (offset + length > bytes.byteLength) {
			throw new Error(`The font's \`${tag}\` table runs past its end.`);
		}
		tables.set(tag, bytes.subarray(offset, offset + length));
	}
	return tables;
}

/**
 * The Unicode character map: from a format 12 subtable when the font has
 * one, since it covers every plane, and otherwise from a format 4 subtable.
 */
function readCharacterMap(cmap: Uint8Array): Map<number, number> {
	const data = view(cmap);
	const subtables = new Map<string, number>();
	const numTables = data.getUint16(2);
	for (let index = 0; index < numTables; index++) {
		const record = 4 + index * 8;
		const platform = data.getUint16(record);
		const encoding = data.getUint16(record + 2);
		subtables.set(`${platform}/${encoding}`, data.getUint32(record + 4));
	}
	for (const key of ["3/10", "0/4", "0/6"]) {
		const offset = subtables.get(key);
		if (offset !== undefined && data.getUint16(offset) === 12) {
			return readFormat12(data, offset);
		}
	}
	for (const key of ["3/1", "0/3", "0/2", "0/1", "0/0"]) {
		const offset = subtables.get(key);
		if (offset !== undefined && data.getUint16(offset) === 4) {
			return readFormat4(data, offset);
		}
	}
	throw new Error("The font has no Unicode character map that this reader understands.");
}

function readFormat12(data: DataView, offset: number): Map<number, number> {
	const characters = new Map<number, number>();
	const numGroups = data.getUint32(offset + 12);
	for (let index = 0; index < numGroups; index++) {
		const group = offset + 16 + index * 12;
		const start = data.getUint32(group);
		const end = data.getUint32(group + 4);
		const startGlyph = data.getUint32(group + 8);
		for (let code = start; code <= end; code++) {
			const glyph = startGlyph + (code - start);
			if (glyph !== 0) {
				characters.set(code, glyph);
			}
		}
	}
	return characters;
}

function readFormat4(data: DataView, offset: number): Map<number, number> {
	const characters = new Map<number, number>();
	const segCount = data.getUint16(offset + 6) / 2;
	const endCodes = offset + 14;
	const startCodes = endCodes + segCount * 2 + 2;
	const idDeltas = startCodes + segCount * 2;
	const idRangeOffsets = idDeltas + segCount * 2;
	for (let segment = 0; segment < segCount; segment++) {
		const start = data.getUint16(startCodes + segment * 2);
		const end = data.getUint16(endCodes + segment * 2);
		const idDelta = data.getInt16(idDeltas + segment * 2);
		const rangeOffsetAt = idRangeOffsets + segment * 2;
		const rangeOffset = data.getUint16(rangeOffsetAt);
		for (let code = start; code <= end && code !== 0xffff; code++) {
			let glyph: number;
			if (rangeOffset === 0) {
				glyph = (code + idDelta) & 0xffff;
			} else {
				const fromArray = data.getUint16(rangeOffsetAt + rangeOffset + (code - start) * 2);
				glyph = fromArray === 0 ? 0 : (fromArray + idDelta) & 0xffff;
			}
			if (glyph !== 0) {
				characters.set(code, glyph);
			}
		}
	}
	return characters;
}
