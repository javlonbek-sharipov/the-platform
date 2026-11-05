/**
 * Reading a Diagram's SVG, which is all the component works from: fetching
 * one from a URL, and finding the drawing's bounds in one.
 */

import type { AnyDiagram } from "../authoring/model.ts";
import type { Box } from "../core/scene.ts";

/** The whole model carried by an engine-made SVG; it never needs laying out in the component. */
export function modelOf(svg: SVGSVGElement): AnyDiagram | undefined {
	const text = svg.querySelector(":scope > metadata")?.textContent;
	return text ? JSON.parse(text) : undefined;
}

/** A Node's drawn bounds, read from the SVG rather than laid out again. */
export interface DrawnNode {
	id: string;
	element: SVGGElement;
	box: Box;
}

/** Rank first, then across the rank; model order settles equal positions. */
export function nodesInLayout(svg: SVGSVGElement, model: AnyDiagram): DrawnNode[] {
	const nodes = [...svg.querySelectorAll<SVGGElement>("[data-node]")].map((element) => ({
		id: element.dataset.node ?? "",
		element,
		box: element.getBBox(),
	}));
	const axis = model.direction === "down" ? "y" : "x";
	const side = axis === "x" ? "y" : "x";
	const middle = (box: Box, along: "x" | "y") =>
		box[along] + (along === "x" ? box.width : box.height) / 2;
	return nodes.sort(
		(a, b) =>
			middle(a.box, axis) - middle(b.box, axis) || middle(a.box, side) - middle(b.box, side),
	);
}

/**
 * Fetches the SVG at a URL. The SVG goes into the page as it is, so the URL
 * must be one the page trusts, as it trusts its own scripts and styles.
 */
export async function fetchSvg(source: string, signal: AbortSignal): Promise<SVGSVGElement> {
	const response = await fetch(source, { signal });
	if (!response.ok) {
		throw new Error(`the server answered ${response.status}`);
	}
	const { documentElement } = new DOMParser().parseFromString(
		await response.text(),
		"image/svg+xml",
	);
	if (!(documentElement instanceof SVGSVGElement)) {
		throw new Error("it isn't an SVG");
	}
	return documentElement;
}

/**
 * The bounds of the drawing in an SVG as the engine wrote it: its `viewBox`.
 * The camera changes the `viewBox` afterwards, so this is read first.
 */
export function boundsOf(svg: SVGSVGElement): Box {
	const { x, y, width, height } = svg.viewBox.baseVal;
	if (!(width > 0 && height > 0)) {
		throw new Error("its SVG has no viewBox, so the engine didn't make it");
	}
	return { x, y, width, height };
}
