/**
 * A small reader for the PNGs that `diagrams export` writes, written from the
 * PNG specification, separately from the engine and its rasterizer.
 */

import { inflateSync } from "node:zlib";

const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Reads a PNG's size from its header, the `IHDR` chunk that follows the signature. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
	if (signature.some((byte, index) => bytes[index] !== byte)) {
		throw new Error("not a PNG: the signature is wrong");
	}
	const type = String.fromCharCode(...bytes.subarray(12, 16));
	if (type !== "IHDR") {
		throw new Error(`not a PNG: the first chunk is ${type}, not IHDR`);
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return { width: view.getUint32(16), height: view.getUint32(20) };
}

export type Rgba = [red: number, green: number, blue: number, alpha: number];

export interface Pixels {
	width: number;
	height: number;
	/** The color of the pixel whose top-left corner is at (x, y). */
	at(x: number, y: number): Rgba;
}

/**
 * Decodes a PNG of 8-bit RGB or RGBA, not interlaced, which is what resvg
 * writes: it inflates the `IDAT` chunks and undoes each row's filter.
 */
export function decodePng(bytes: Uint8Array): Pixels {
	const { width, height } = pngSize(bytes);
	const [depth, colorType, , , interlace] = bytes.subarray(24, 29);
	if (depth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
		throw new Error(`unsupported PNG: depth ${depth}, color type ${colorType}`);
	}
	const channels = colorType === 6 ? 4 : 3;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const data: Uint8Array[] = [];
	for (let at = 8; at < bytes.length; ) {
		const length = view.getUint32(at);
		const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
		if (type === "IDAT") {
			data.push(bytes.subarray(at + 8, at + 8 + length));
		}
		at += length + 12;
	}
	const raw = inflateSync(Buffer.concat(data));
	const stride = width * channels;
	const rows: Uint8Array[] = [];
	let above = new Uint8Array(stride);
	for (let y = 0; y < height; y++) {
		const start = y * (stride + 1);
		const filter = raw[start];
		const row = new Uint8Array(stride);
		for (let index = 0; index < stride; index++) {
			const left = index < channels ? 0 : (row[index - channels] ?? 0);
			const up = above[index] ?? 0;
			const upLeft = index < channels ? 0 : (above[index - channels] ?? 0);
			const predicted = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, upLeft)][
				filter ?? 0
			];
			if (predicted === undefined) {
				throw new Error(`unknown filter ${filter} in row ${y}`);
			}
			row[index] = ((raw[start + 1 + index] ?? 0) + predicted) & 255;
		}
		rows.push(row);
		above = row;
	}
	return {
		width,
		height,
		at(x, y) {
			const row = rows[y];
			if (row === undefined || x < 0 || x >= width) {
				throw new Error(`(${x}, ${y}) lies outside the ${width} × ${height} PNG`);
			}
			const [red = 0, green = 0, blue = 0, alpha = 255] = row.subarray(
				x * channels,
				(x + 1) * channels,
			);
			return [red, green, blue, alpha];
		},
	};
}

/** The PNG specification's Paeth predictor. */
function paeth(left: number, up: number, upLeft: number): number {
	const estimate = left + up - upLeft;
	const toLeft = Math.abs(estimate - left);
	const toUp = Math.abs(estimate - up);
	const toUpLeft = Math.abs(estimate - upLeft);
	if (toLeft <= toUp && toLeft <= toUpLeft) {
		return left;
	}
	return toUp <= toUpLeft ? up : upLeft;
}
