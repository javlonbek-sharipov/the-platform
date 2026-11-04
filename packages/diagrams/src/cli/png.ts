/**
 * PNG export: an engine-made SVG drawn by resvg. Only the CLI uses it, since
 * resvg is MPL-2.0, which the spec allows only for an unmodified dependency
 * of the CLI.
 */

import { Resvg } from "@resvg/resvg-js";

export interface PngOptions {
	/** How many pixels the PNG has for each unit of the SVG's width and height. */
	scale: number;
}

/** Draws an engine-made SVG as a PNG. */
export function drawPng(svg: string, { scale }: PngOptions): Uint8Array {
	return new Resvg(svg, {
		fitTo: { mode: "zoom", value: scale },
		font: { loadSystemFonts: false },
	})
		.render()
		.asPng();
}
