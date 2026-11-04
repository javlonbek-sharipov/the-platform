/**
 * Edge labels (spec: Edge routing, step 8). Each Edge that has a label, a
 * Technology or a rate gets a box beside its route, with its label's text on
 * the first line, and its Technology and rate on the line below. The box goes
 * beside the longest straight run that belongs to its Edge alone, centered
 * along it.
 */

import type { Edge } from "../authoring/model.ts";
import type { Box, Point, RoutePoint, SceneEdge, SceneLabel } from "./scene.ts";
import { type LabelContent, labelBoxSize, labelTexts, labelWidth } from "./text.ts";

/** How far a label's box keeps from the line it sits beside. */
const labelGap = 4;

/** The room a label keeps clear at each end of the stretch it sits beside, along the stretch. */
export const labelEnds = 8;

/** Two lines closer than this are one, as two routes in one lane are. */
const sameLine = 0.5;

/** What an Edge's label shows, if it shows anything. */
export function labelContent(edge: Edge): LabelContent | undefined {
	const { label, technology, rate } = edge;
	if (label === undefined && technology === undefined && rate === undefined) {
		return undefined;
	}
	return {
		...(label === undefined ? {} : { text: label }),
		...(technology === undefined ? {} : { technology }),
		...(rate === undefined ? {} : { rate }),
	};
}

/** The size of an Edge's label box, if the Edge has a label, a Technology or a rate. */
export function labelSize(edge: Edge): { width: number; height: number } | undefined {
	const content = labelContent(edge);
	return content === undefined ? undefined : labelBoxSize(content, labelWidth(content));
}

/** A straight stretch of a route, along one line. */
interface Stretch {
	horizontal: boolean;
	/** Its line: y for a horizontal stretch, x for a vertical one. */
	line: number;
	low: number;
	high: number;
}

/** Each Edge's label, by the Edge's id. */
export function placeLabels(
	diagram: { edges: Edge[] },
	edges: SceneEdge[],
): Map<string, SceneLabel> {
	const byId = new Map(edges.map((edge) => [edge.id, edge]));
	const labels = new Map<string, SceneLabel>();
	for (const edge of diagram.edges) {
		const content = labelContent(edge);
		const scene = byId.get(edge.id);
		if (content === undefined || scene === undefined) {
			continue;
		}
		const size = labelBoxSize(content, labelWidth(content));
		const others = edges
			.filter((other) => other !== scene)
			.flatMap(({ route }) => runsOf(route, false));
		const [stretch] = ownStretches(scene, others).sort((a, b) => b.high - b.low - (a.high - a.low));
		const box =
			stretch === undefined ? centeredOn(midpointOf(scene.route), size) : beside(stretch, size);
		labels.set(edge.id, { box, ...labelTexts(content, box) });
	}
	return labels;
}

/** A box of the given size beside a stretch, centered along it: above a horizontal one, right of a vertical one. */
function beside(stretch: Stretch, size: { width: number; height: number }): Box {
	const middle = (stretch.low + stretch.high) / 2;
	return stretch.horizontal
		? {
				x: middle - size.width / 2,
				y: stretch.line - labelGap - size.height,
				...size,
			}
		: { x: stretch.line + labelGap, y: middle - size.height / 2, ...size };
}

function centeredOn(point: Point, size: { width: number; height: number }): Box {
	return { x: point.x - size.width / 2, y: point.y - size.height / 2, ...size };
}

/**
 * Each run of a route, from corner to corner, or, `straight`, only its
 * straight part, between the arcs that round its corners.
 */
function runsOf(route: RoutePoint[], straight: boolean): Stretch[] {
	return route.slice(1).flatMap((to, index): Stretch[] => {
		const from = route[index];
		if (from === undefined) {
			return [];
		}
		const horizontal = from.y === to.y;
		const [a, b] = horizontal ? [from.x, to.x] : [from.y, to.y];
		const [lowEnd, highEnd] = a < b ? [from, to] : [to, from];
		return [
			{
				horizontal,
				line: horizontal ? from.y : from.x,
				low: Math.min(a, b) + (straight ? lowEnd.radius : 0),
				high: Math.max(a, b) - (straight ? highEnd.radius : 0),
			},
		];
	});
}

/**
 * The stretches of an Edge's route that belong to it alone: each run's
 * straight part, beyond the stubs of the Edge's two Ports, less every part
 * that another route runs along too, as a trunk does.
 */
function ownStretches(edge: SceneEdge, others: Stretch[]): Stretch[] {
	return runsOf(edge.route, true).flatMap((run) => {
		const cuts: [number, number][] = [];
		for (const { point, stub } of [edge.fromPort, edge.toPort]) {
			const alongStub = run.horizontal ? point.y === stub.y : point.x === stub.x;
			if (alongStub && Math.abs((run.horizontal ? point.y : point.x) - run.line) < sameLine) {
				const [a, b] = run.horizontal ? [point.x, stub.x] : [point.y, stub.y];
				cuts.push([Math.min(a, b), Math.max(a, b)]);
			}
		}
		for (const other of others) {
			if (other.horizontal === run.horizontal && Math.abs(other.line - run.line) < sameLine) {
				cuts.push([other.low, other.high]);
			}
		}
		return without([run.low, run.high], cuts).map(([low, high]) => ({ ...run, low, high }));
	});
}

/** What's left of an interval once the cuts are taken out of it. */
function without(interval: [number, number], cuts: [number, number][]): [number, number][] {
	let pieces = [interval];
	for (const [low, high] of cuts) {
		pieces = pieces.flatMap(([a, b]): [number, number][] =>
			high <= a || low >= b
				? [[a, b]]
				: [
						...(low > a ? [[a, low] as [number, number]] : []),
						...(high < b ? [[high, b] as [number, number]] : []),
					],
		);
	}
	return pieces.filter(([low, high]) => high > low);
}

/** The point halfway along a route. */
function midpointOf(route: Point[]): Point {
	const lengths = route.slice(1).map((point, index) => {
		const before = route[index] ?? point;
		return Math.abs(point.x - before.x) + Math.abs(point.y - before.y);
	});
	let left = lengths.reduce((sum, length) => sum + length, 0) / 2;
	for (const [index, length] of lengths.entries()) {
		const from = route[index];
		const to = route[index + 1];
		if (from !== undefined && to !== undefined && left <= length) {
			const share = length === 0 ? 0 : left / length;
			return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
		}
		left -= length;
	}
	return route[0] ?? { x: 0, y: 0 };
}
