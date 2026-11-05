/**
 * The encodings the SVG writer needs, written out so that the core needs no
 * runtime dependency: a hash for the name that scopes an SVG's style, and
 * base64 for the font data it embeds.
 */

/**
 * A 64-bit FNV-1a hash of the text's UTF-16 code units, in hex. The hash is
 * kept as four 16-bit limbs, lowest first, so that every step is exact in
 * plain numbers, and much faster than in BigInts. Multiplying by the FNV prime,
 * 2⁴⁰ + 0x1b3, is multiplying by 0x1b3 and adding the hash shifted up by 40
 * bits, carrying from limb to limb and dropping what passes 64 bits.
 */
export function hash(text: string): string {
	let l0 = 0x2325;
	let l1 = 0x8422;
	let l2 = 0x9ce4;
	let l3 = 0xcbf2;
	for (let index = 0; index < text.length; index++) {
		l0 ^= text.charCodeAt(index);
		let carry = l0 * 0x1b3;
		const r0 = carry & 0xffff;
		carry = (carry >>> 16) + l1 * 0x1b3;
		const r1 = carry & 0xffff;
		carry = (carry >>> 16) + l2 * 0x1b3 + ((l0 << 8) & 0xffff);
		const r2 = carry & 0xffff;
		carry = (carry >>> 16) + l3 * 0x1b3 + (((l1 << 8) | (l0 >>> 8)) & 0xffff);
		l0 = r0;
		l1 = r1;
		l2 = r2;
		l3 = carry & 0xffff;
	}
	return [l3, l2, l1, l0].map((limb) => limb.toString(16).padStart(4, "0")).join("");
}

const base64Digits = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64(bytes: Uint8Array): string {
	let text = "";
	for (let index = 0; index < bytes.length; index += 3) {
		const group =
			((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
		text += base64Digits[(group >> 18) & 63];
		text += base64Digits[(group >> 12) & 63];
		text += index + 1 < bytes.length ? base64Digits[(group >> 6) & 63] : "=";
		text += index + 2 < bytes.length ? base64Digits[group & 63] : "=";
	}
	return text;
}
