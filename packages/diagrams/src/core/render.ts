/**
 * The core's single entry point. It takes a Diagram, built by the authoring
 * API or read from JSON, and returns its diagnostics. When there are no
 * errors, it also returns the scene and the SVG.
 */

import type { Bundling } from "./bundles.ts";
import type { Diagnostic } from "./diagnostics.ts";
import { labelSpacing } from "./labels.ts";
import { clearance, grid, layOut, margin } from "./layout.ts";
import { lanes, route } from "./route.ts";
import type { Box, Scene, SceneEdge } from "./scene.ts";
import { writeSvg } from "./svg.ts";
import { type FontData, textDiagnostics } from "./text.ts";
import { validate } from "./validate.ts";

export interface RenderResult {
	diagnostics: Diagnostic[];
	scene?: Scene;
	svg?: string;
}

export interface RenderOptions {
	/**
	 * Which Edges share a trunk: those of one Kind into one Port (`target`,
	 * which the architecture Notation uses and the default), those of one Kind
	 * out of one Port (`source`), or none. A later Notation may bundle
	 * differently, and tests compare the three.
	 */
	bundle?: Bundling;
	/**
	 * Gives the SVG the bundled font's glyphs that it draws. Without it, the
	 * SVG embeds no font, which suits callers that only look at the scene.
	 */
	fontData?: FontData;
	/**
	 * How many states each Edge's route search may visit. An Edge whose search
	 * runs out falls back to a simple route, with a warning. The default is well
	 * above what routes on Diagrams of a few hundred Nodes need.
	 */
	searchBudget?: number;
}

export function render(diagram: unknown, options: RenderOptions = {}): RenderResult {
	const validation = validate(diagram);
	if (validation.diagram === undefined) {
		return { diagnostics: validation.diagnostics };
	}
	const model = validation.diagram;
	const { nodes, groups } = layOut(model, options.bundle);
	const { edges, diagnostics } = route(model, nodes, groups, options);
	const scene: Scene = {
		bounds: boundsOf(
			[
				...nodes.flatMap(({ box, callout }) =>
					callout === undefined ? [box] : [box, callout.tag],
				),
				...groups.map(({ box }) => box),
				...edges.flatMap(({ label }) => (label === undefined ? [] : [label.box])),
			],
			edges,
		),
		clearance,
		grid,
		lanes,
		labelSpacing,
		nodes,
		groups,
		edges,
		diagnostics: [...textDiagnostics(model, nodes, groups, edges), ...diagnostics],
	};
	return {
		diagnostics: [...validation.diagnostics, ...scene.diagnostics],
		scene,
		svg: writeSvg(scene, options.fontData),
	};
}

/**
 * The bounds of the drawing, with a margin: every Node's and Group's box,
 * every callout's tag, which sits above its Node, every label, and every
 * route.
 */
function boundsOf(boxes: Box[], edges: SceneEdge[]): Box {
	const xs = [
		...boxes.flatMap((box) => [box.x, box.x + box.width]),
		...edges.flatMap((edge) => edge.route.map((point) => point.x)),
	];
	const ys = [
		...boxes.flatMap((box) => [box.y, box.y + box.height]),
		...edges.flatMap((edge) => edge.route.map((point) => point.y)),
	];
	const left = Math.min(margin, ...xs) - margin;
	const top = Math.min(margin, ...ys) - margin;
	const right = Math.max(margin, ...xs) + margin;
	const bottom = Math.max(margin, ...ys) + margin;
	return { x: left, y: top, width: right - left, height: bottom - top };
}
