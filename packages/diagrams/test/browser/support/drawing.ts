/**
 * Diagrams drawn for the web component's tests. The core runs in the browser
 * here, so each test makes the SVGs it needs during its setup, with the
 * bundled font's glyphs embedded, as the Atlas embeds them on the Node side.
 */

import { subsetFont } from "../../../src/fonts/subset.ts";
import { readTrueType, type TrueTypeFont } from "../../../src/fonts/truetype.ts";
import { type FontWeight, render, type Scene } from "../../../src/index.ts";

async function bundledFont(file: string): Promise<TrueTypeFont> {
	const response = await fetch(new URL(`../../../fonts/${file}`, import.meta.url));
	if (!response.ok) {
		throw new Error(`can't read the bundled font ${file}: ${response.status}`);
	}
	return readTrueType(new Uint8Array(await response.arrayBuffer()));
}

const fonts: Record<FontWeight, TrueTypeFont> = {
	regular: await bundledFont("Inter-Regular.ttf"),
	semibold: await bundledFont("Inter-SemiBold.ttf"),
};

/** A Diagram as the engine draws it: its SVG, which the web component shows, and its scene. */
export interface Drawing {
	svg: string;
	scene: Scene;
}

/** Draws a Diagram that has no errors. */
export function draw(diagram: unknown): Drawing {
	const { svg, scene, diagnostics } = render(diagram, {
		fontData: ({ weight, characters }) => subsetFont(fonts[weight], characters),
	});
	if (svg === undefined || scene === undefined) {
		throw new Error(
			`the Diagram has errors: ${diagnostics.map(({ message }) => message).join(" ")}`,
		);
	}
	return { svg, scene };
}
