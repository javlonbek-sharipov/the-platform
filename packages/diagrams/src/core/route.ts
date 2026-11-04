/**
 * Edge routing (spec: Edge routing). Each Edge runs from the end of its
 * source Port's stub to the end of its target Port's stub, along the routing
 * grid, by the cheapest path the search finds. When the search finds none,
 * the Edge falls back to a simple route, and the router warns about it.
 */

import type { Diagram, Direction } from "../authoring/model.ts";
import type { Diagnostic } from "./diagnostics.ts";
import { buildGrid, type Grid, pointOf, vertexAt } from "./grid.ts";
import { clearance } from "./layout.ts";
import type { Box, Point, RoutePoint, SceneEdge, SceneNode, ScenePort, Side } from "./scene.ts";
import { type Heading, opposite, search } from "./search.ts";

export interface RouteOptions {
	/**
	 * How many states each Edge's search may visit. An Edge whose search runs
	 * out falls back to the simple route.
	 */
	searchBudget?: number;
}

export interface Routing {
	/** One per Edge, in model order. */
	edges: SceneEdge[];
	diagnostics: Diagnostic[];
}

/** A bend costs as much as this much length, which favors routes with few bends. */
const bendCost = 40;

/** The radius of a rounded corner, where both runs that meet there are long enough. */
const cornerRadius = 8;

/** Enough for any Diagram of a few hundred Nodes. */
const defaultSearchBudget = 200_000;

/** The heading of a stub, out of its side. */
const outOf: Record<Side, Heading> = {
	left: "west",
	right: "east",
	top: "north",
	bottom: "south",
};

export function route(diagram: Diagram, nodes: SceneNode[], options: RouteOptions = {}): Routing {
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const grid = buildGrid(nodes, clearance);
	const budget = options.searchBudget ?? defaultSearchBudget;
	const edges = diagram.edges.map((edge): SceneEdge => {
		const from = byId.get(edge.from);
		const to = byId.get(edge.to);
		if (from === undefined || to === undefined) {
			throw new Error(`Edge ${edge.id} ends at a Node that validation should have rejected`);
		}
		const found = searchRoute(grid, from.output, to.input, budget);
		return {
			id: edge.id,
			kind: edge.kind,
			from: edge.from,
			to: edge.to,
			fromPort: from.output,
			toPort: to.input,
			route: roundCorners(polyline(found ?? fallbackRoute(from, to, diagram.direction))),
			fellBack: found === undefined,
		};
	});
	const diagnostics = edges.flatMap(({ id, fellBack }, index): Diagnostic[] =>
		fellBack
			? [
					{
						severity: "warning",
						rule: "fallback-route",
						message: `Edge \`${id}\` couldn't be routed around the Nodes, so it's drawn along a simple route that may cross them.`,
						pointer: `/edges/${index}`,
					},
				]
			: [],
	);
	return { edges, diagnostics };
}

/**
 * The route the search finds between two Ports' stubs, if it finds one. The
 * search runs backward, from the target's stub to the source's. Among routes
 * that cost the same, it then finds the one that bends nearest the source, so
 * Edges from one Port fork just past its stub, and Edges into one Port merge
 * well before it.
 */
function searchRoute(
	grid: Grid,
	fromPort: ScenePort,
	toPort: ScenePort,
	budget: number,
): Point[] | undefined {
	const start = vertexAt(grid, toPort.stub);
	const goal = vertexAt(grid, fromPort.stub);
	if (start === undefined || goal === undefined) {
		return undefined;
	}
	const path = search(
		grid,
		{ vertex: start, heading: outOf[toPort.side] },
		{ vertex: goal, heading: opposite[outOf[fromPort.side]] },
		{ bend: bendCost, budget },
	);
	return (
		path && [fromPort.point, ...path.reverse().map((vertex) => pointOf(grid, vertex)), toPort.point]
	);
}

/**
 * The simple route an Edge falls back to when the search finds none (spec:
 * Edge routing, step 11). If the target lies ahead of the source along the
 * direction, the route runs straight, jogs once halfway between the Ports,
 * and runs on. Otherwise it steps out of the source's Port, moves to a lane
 * beyond both Nodes, travels back past them, and enters the target from its
 * input side.
 */
function fallbackRoute(from: SceneNode, to: SceneNode, direction: Direction): Point[] {
	// Worked out as if the direction were `right`: for `down`, x and y swap
	// on the way in, and swap back on the way out.
	const turn = direction === "down" ? transpose : (point: Point) => point;
	const start = turn(from.output.point);
	const out = turn(from.output.stub);
	const end = turn(to.input.point);
	const into = turn(to.input.stub);
	if (into.x >= out.x) {
		const middle = (start.x + end.x) / 2;
		return [start, { x: middle, y: start.y }, { x: middle, y: end.y }, end].map(turn);
	}
	const boxes = [from.box, to.box].map((box) => (direction === "down" ? transposeBox(box) : box));
	const above = Math.min(...boxes.map((box) => box.y)) - clearance / 2;
	const below = Math.max(...boxes.map((box) => box.y + box.height)) + clearance / 2;
	const lane =
		start.y - above + (end.y - above) < below - start.y + (below - end.y) ? above : below;
	return [start, out, { x: out.x, y: lane }, { x: into.x, y: lane }, into, end].map(turn);
}

function transpose({ x, y }: Point): Point {
	return { x: y, y: x };
}

function transposeBox({ x, y, width, height }: Box): Box {
	return { x: y, y: x, width: height, height: width };
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
