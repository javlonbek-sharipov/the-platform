/**
 * Edge routing (spec: Edge routing). Each Edge runs from the end of its
 * source Port's stub to the end of its target Port's stub, along the routing
 * grid, by the cheapest path the search finds.
 */

import type { Diagram } from "../authoring/model.ts";
import { buildGrid, type Grid, pointOf, vertexAt } from "./grid.ts";
import { clearance } from "./layout.ts";
import type { Point, RoutePoint, SceneEdge, SceneNode, ScenePort, Side } from "./scene.ts";
import { type Heading, opposite, search } from "./search.ts";

/** A bend costs as much as this much length, which favors routes with few bends. */
const bendCost = 40;

/** The radius of a rounded corner, where both runs that meet there are long enough. */
const cornerRadius = 8;

/** How many states one Edge's search may visit. */
const searchBudget = 200_000;

/** The heading of a stub, out of its side. */
const outOf: Record<Side, Heading> = {
	left: "west",
	right: "east",
	top: "north",
	bottom: "south",
};

export function route(diagram: Diagram, nodes: SceneNode[]): SceneEdge[] {
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const grid = buildGrid(nodes, clearance);
	return diagram.edges.map((edge) => {
		const from = byId.get(edge.from);
		const to = byId.get(edge.to);
		if (from === undefined || to === undefined) {
			throw new Error(`Edge ${edge.id} ends at a Node that validation should have rejected`);
		}
		return {
			id: edge.id,
			kind: edge.kind,
			from: edge.from,
			to: edge.to,
			fromPort: from.output,
			toPort: to.input,
			route: roundCorners(
				polyline(searchRoute(grid, from.output, to.input) ?? alongStubs(from.output, to.input)),
			),
		};
	});
}

/**
 * The route the search finds between two Ports' stubs, if it finds one. The
 * search runs backward, from the target's stub to the source's. Among routes
 * that cost the same, it then finds the one that bends nearest the source, so
 * Edges from one Port fork just past its stub, and Edges into one Port merge
 * well before it.
 */
function searchRoute(grid: Grid, fromPort: ScenePort, toPort: ScenePort): Point[] | undefined {
	const start = vertexAt(grid, toPort.stub);
	const goal = vertexAt(grid, fromPort.stub);
	if (start === undefined || goal === undefined) {
		return undefined;
	}
	const path = search(
		grid,
		{ vertex: start, heading: outOf[toPort.side] },
		{ vertex: goal, heading: opposite[outOf[fromPort.side]] },
		{ bend: bendCost, budget: searchBudget },
	);
	return (
		path && [fromPort.point, ...path.reverse().map((vertex) => pointOf(grid, vertex)), toPort.point]
	);
}

function alongStubs(fromPort: ScenePort, toPort: ScenePort): Point[] {
	return [
		fromPort.point,
		fromPort.stub,
		{ x: toPort.stub.x, y: fromPort.stub.y },
		toPort.stub,
		toPort.point,
	];
}

/**
 * The route as a polyline: runs that take turns between horizontal and
 * vertical, each merging the steps it's made of.
 */
function polyline(points: Point[]): Point[] {
	const kept: Point[] = [];
	for (const point of points) {
		const last = kept.at(-1);
		if (last !== undefined && last.x === point.x && last.y === point.y) {
			continue;
		}
		const beforeLast = kept.at(-2);
		if (
			last !== undefined &&
			beforeLast !== undefined &&
			((beforeLast.x === last.x && last.x === point.x) ||
				(beforeLast.y === last.y && last.y === point.y))
		) {
			kept.pop();
		}
		kept.push(point);
	}
	return kept;
}

/**
 * Rounds each corner with an arc. Its radius is at most half of either run
 * that meets there, so two corners' arcs never overlap on the run between
 * them.
 */
function roundCorners(points: Point[]): RoutePoint[] {
	return points.map(({ x, y }, index) => {
		const before = points[index - 1];
		const after = points[index + 1];
		const radius =
			before === undefined || after === undefined
				? 0
				: Math.min(cornerRadius, runLength(before, { x, y }) / 2, runLength({ x, y }, after) / 2);
		return { x, y, radius };
	});
}

/** The length of a horizontal or vertical run. */
function runLength(a: Point, b: Point): number {
	return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
