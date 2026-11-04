/**
 * The core's single entry point. It takes a Diagram, built by the authoring
 * API or read from JSON, and returns its diagnostics. When there are no
 * errors, it also returns the scene and the SVG.
 */

import type { Diagnostic } from "./diagnostics.ts";
import { clearance, grid, layOut, margin } from "./layout.ts";
import { route } from "./route.ts";
import type { Box, Scene, SceneEdge, SceneNode } from "./scene.ts";
import { writeSvg } from "./svg.ts";
import { validate } from "./validate.ts";

export interface RenderResult {
	diagnostics: Diagnostic[];
	scene?: Scene;
	svg?: string;
}

export interface RenderOptions {
	/**
	 * How many states each Edge's route search may visit. An Edge whose search
	 * runs out falls back to a simple route, with a warning. The default is far
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
	const nodes = layOut(model);
	const { edges, diagnostics } = route(model, nodes, options);
	const scene: Scene = {
		bounds: boundsOf(nodes, edges),
		clearance,
		grid,
		nodes,
		edges,
		diagnostics,
	};
	return {
		diagnostics: [...validation.diagnostics, ...scene.diagnostics],
		scene,
		svg: writeSvg(scene),
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
