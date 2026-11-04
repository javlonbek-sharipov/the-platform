/**
 * A small reader for the PNGs that `diagrams export` writes, written from the
 * PNG specification, separately from the engine and its rasterizer.
 */

const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface Png {
	width: number;
	height: number;
}

/** Reads a PNG's size from its header, the `IHDR` chunk that follows the signature. */
export function readPng(bytes: Uint8Array): Png {
	if (signature.some((byte, index) => bytes[index] !== byte)) {
		throw new Error("not a PNG: the signature is wrong");
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const type = String.fromCharCode(...bytes.subarray(12, 16));
	if (type !== "IHDR") {
		throw new Error(`not a PNG: the first chunk is ${type}, not IHDR`);
	}
	return { width: view.getUint32(16), height: view.getUint32(20) };
}
