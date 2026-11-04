/**
 * PNG export: an engine-made SVG drawn by resvg. Only the CLI uses it, since
 * resvg is MPL-2.0, which the spec allows only for an unmodified dependency
 * of the CLI.
 */

import { Resvg } from "@resvg/resvg-js";

/** Draws an engine-made SVG as a PNG. */
export function drawPng(svg: string): Uint8Array {
	return new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
}
