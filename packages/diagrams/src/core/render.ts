/**
 * The core's single entry point. It takes a Diagram, built by the authoring
 * API or read from JSON, and returns its diagnostics. When there are no
 * errors, it also returns the scene and the SVG.
 */

import type { Diagnostic } from "./diagnostics.ts";
import { layOut, margin } from "./layout.ts";
import { route } from "./route.ts";
import type { Box, Scene, SceneEdge, SceneNode } from "./scene.ts";
import { writeSvg } from "./svg.ts";
import { type FontData, titleDiagnostics } from "./text.ts";
import { validate } from "./validate.ts";

export interface RenderResult {
	diagnostics: Diagnostic[];
	scene?: Scene;
	svg?: string;
}

export interface RenderOptions {
	/**
	 * Gives the SVG the bundled font's glyphs that it draws. Without it, the
	 * SVG embeds no font, which suits callers that only look at the scene.
	 */
	fontData?: FontData;
}

export function render(diagram: unknown, options: RenderOptions = {}): RenderResult {
	const validation = validate(diagram);
	if (validation.diagram === undefined) {
		return { diagnostics: validation.diagnostics };
	}
	const model = validation.diagram;
	const nodes = layOut(model);
	const edges = route(model, nodes);
	const scene: Scene = {
		bounds: boundsOf(nodes, edges),
		nodes,
		edges,
		diagnostics: titleDiagnostics(model, nodes),
	};
	return {
		diagnostics: [...validation.diagnostics, ...scene.diagnostics],
		scene,
		svg: writeSvg(scene, options.fontData),
	};
}

function boundsOf(nodes: SceneNode[], edges: SceneEdge[]): Box {
	const xs = [
		...nodes.flatMap((node) => [node.box.x, node.box.x + node.box.width]),
		...edges.flatMap((edge) => edge.route.map((point) => point.x)),
	];
	const ys = [
		...nodes.flatMap((node) => [node.box.y, node.box.y + node.box.height]),
		...edges.flatMap((edge) => edge.route.map((point) => point.y)),
	];
	const left = Math.min(margin, ...xs) - margin;
	const top = Math.min(margin, ...ys) - margin;
	const right = Math.max(margin, ...xs) + margin;
	const bottom = Math.max(margin, ...ys) + margin;
	return { x: left, y: top, width: right - left, height: bottom - top };
}
