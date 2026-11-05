/**
 * The core's single entry point. It takes a Diagram, built by the authoring
 * API or read from JSON, and returns its diagnostics. When there are no
 * errors, it also returns the scene and the SVG.
 */

import type { Notation } from "../notations/notation.ts";
import { notations } from "../notations/notations.ts";
import { type Bundling, defaultBundling, lanes } from "./bundles.ts";
import type { Diagnostic } from "./diagnostics.ts";
import { hop } from "./hops.ts";
import { labelSpacing } from "./labels.ts";
import { clearance, grid, layOut, margin } from "./layout.ts";
import { junctionsOf, markEdges } from "./marks.ts";
import { route } from "./route.ts";
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
	 * The Notations that the Diagram may be written in, each by its definition.
	 * The default is the engine's own.
	 */
	notations?: readonly Notation[];
	/**
	 * How many states each Edge's route search may visit. An Edge whose search
	 * runs out falls back to a simple route, with a warning. The default is well
	 * above what routes on Diagrams of a few hundred Nodes need.
	 */
	searchBudget?: number;
}

/**
 * How many times layout and routing run at most: once, and once more each
 * time trunks crowd out labels, with those labels' Edges in lanes of their
 * own. Each time can only add to them, so this bounds the work.
 */
const rounds = 5;

export function render(diagram: unknown, options: RenderOptions = {}): RenderResult {
	const validation = validate(diagram, options.notations ?? notations);
	if (validation.diagram === undefined) {
		return { diagnostics: validation.diagnostics };
	}
	const { diagram: model, notation } = validation;
	// A labeled Edge that its bundle's trunk leaves no run of its own that holds
	// its label keeps a lane of its own instead (spec: Edge routing, step 8).
	// Layout leaves room for that lane too, so both run again, until no trunk
	// crowds out another label.
	const ownLanes = new Set<string>();
	const bundle = options.bundle ?? defaultBundling;
	let { nodes, groups } = layOut(model, notation, bundle, ownLanes);
	let routing = route(model, nodes, groups, { ...options, bundle, ownLanes });
	for (let round = 1; round < rounds && routing.crowdedOut.length > 0; round += 1) {
		for (const id of routing.crowdedOut) {
			ownLanes.add(id);
		}
		({ nodes, groups } = layOut(model, notation, bundle, ownLanes));
		routing = route(model, nodes, groups, { ...options, bundle, ownLanes });
	}
	const edges = markEdges(model, routing.edges);
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
		hop,
		nodes,
		groups,
		edges,
		junctions: junctionsOf(routing.edges),
		diagnostics: [...textDiagnostics(model, nodes, groups, edges), ...routing.diagnostics],
	};
	return {
		diagnostics: [...validation.diagnostics, ...scene.diagnostics],
		scene,
		svg: writeSvg(model, notation, scene, options.fontData),
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
