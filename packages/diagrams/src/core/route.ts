/**
 * Edge routing (spec: Edge routing). Each Edge runs from the end of its
 * source Port's stub to the end of its target Port's stub, along the routing
 * grid, by the cheapest path the search finds. When the search finds none,
 * the Edge falls back to a simple route, and the router warns about it.
 */

import { type Diagram, endNode, type RowEnd } from "../authoring/model.ts";
import type { Diagnostic } from "./diagnostics.ts";
import { buildGrid, type Grid, pointOf, vertexAt } from "./grid.ts";
import { clearance } from "./layout.ts";
import { type NudgeRoute, nudge } from "./nudge.ts";
import type {
	Box,
	Point,
	RoutePoint,
	SceneEdge,
	SceneGroup,
	SceneNode,
	ScenePort,
	Side,
} from "./scene.ts";
import {
	type Heading,
	opposite,
	type Search,
	type SearchEnd,
	type SearchStart,
	searchOn,
} from "./search.ts";

/**
 * Which Edges share a trunk (spec: Edge routing, step 4): those of one Kind
 * that go into one Port, those of one Kind that leave one Port, or none.
 * Parallel Edges never share one.
 */
export type Bundling = "target" | "source" | "none";

export interface RouteOptions {
	/** Which Edges share a trunk. The architecture Notation bundles by target. */
	bundle?: Bundling;
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

/**
 * Crossing a Group's border costs as much as this much length, so that a
 * route passes beside a Group rather than through it when that costs little
 * more.
 */
const crossingCost = 16;

/** The radius of a rounded corner, where both runs that meet there are long enough. */
const cornerRadius = 8;

/**
 * How many states one Edge's search may visit: a guard against a runaway
 * search, set well above what routes on Diagrams of a few hundred Nodes need.
 */
const defaultSearchBudget = 1_000_000;

/**
 * Lanes keep the preferred spacing where there's room, squeeze down to the
 * minimum in a narrow corridor, and keep the padding from the corridor's
 * sides. The narrowest corridor, a clearance wide, holds four lanes.
 */
const laneSpacing = { preferred: 8, minimum: 4, padding: 8 };

/**
 * Each Edge's lane group: the Edges that may share a lane, which is a bundle
 * (spec: Edge routing, step 4). A bundle is the Edges of one Kind that go into
 * one Port, or that leave one Port, or each Edge on its own. Parallel Edges,
 * which join the same pair of Ports, never share one: the second Edge between
 * two Ports in a bundle goes into a second group, and so on.
 */
function laneGroups(diagram: Diagram, bundle: Bundling): Map<string, string> {
	const groups = new Map<string, string>();
	const taken = new Map<string, number>();
	const port = (end: string | RowEnd) => (typeof end === "string" ? [end] : [end.node, end.row]);
	for (const edge of [...diagram.edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
		const [shared, other] =
			bundle === "source" ? [port(edge.from), port(edge.to)] : [port(edge.to), port(edge.from)];
		const key = bundle === "none" ? edge.id : JSON.stringify([edge.kind, ...shared]);
		const pair = JSON.stringify([key, ...other]);
		const index = taken.get(pair) ?? 0;
		taken.set(pair, index + 1);
		groups.set(edge.id, JSON.stringify([key, index]));
	}
	return groups;
}

/** The heading of a stub, out of its side. */
const outOf: Record<Side, Heading> = {
	left: "west",
	right: "east",
	top: "north",
	bottom: "south",
};

export function route(
	diagram: Diagram,
	nodes: SceneNode[],
	groups: SceneGroup[],
	options: RouteOptions = {},
): Routing {
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const rowNames = new Map(
		diagram.nodes.map((node) => [node.id, (node.rows ?? []).map((row) => row.name)]),
	);
	/**
	 * The Port an Edge end uses on the given side: its Node's header Port, or
	 * the Port of the Row it names.
	 */
	const portOf = (end: string | RowEnd, side: "input" | "output"): ScenePort | undefined => {
		const node = byId.get(endNode(end));
		if (typeof end === "string") {
			return node?.[side];
		}
		return node?.rows[rowNames.get(end.node)?.indexOf(end.row) ?? -1]?.[side];
	};
	const grid = buildGrid(nodes, groups, clearance);
	const search = searchOn(grid);
	const budget = options.searchBudget ?? defaultSearchBudget;
	const bundle = options.bundle ?? "target";
	const groupOf = laneGroups(diagram, bundle);
	const trunks = new Map<string, Trunk>();
	// Edges are routed in a stable order, by id, so that no route depends on
	// the order the Diagram declares its Edges in.
	const routed = new Map<string, SceneEdge>();
	const found = new Map<string, NudgeRoute>();
	for (const edge of [...diagram.edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
		const from = byId.get(endNode(edge.from));
		const to = byId.get(endNode(edge.to));
		const fromPort = portOf(edge.from, "output");
		const toPort = portOf(edge.to, "input");
		if (from === undefined || to === undefined || fromPort === undefined || toPort === undefined) {
			throw new Error(`Edge ${edge.id} ends at a Port that validation should have rejected`);
		}
		const group = groupOf.get(edge.id) ?? edge.id;
		const trunk = trunks.get(group) ?? new Map();
		trunks.set(group, trunk);
		const vertices = searchRoute(grid, search, fromPort, toPort, budget, {
			trunk,
			atSource: bundle === "source",
		});
		const path = vertices && [
			fromPort.point,
			...vertices.map((vertex) => pointOf(grid, vertex)),
			toPort.point,
		];
		if (vertices !== undefined && path !== undefined) {
			vertices.forEach((vertex, at) => {
				if (!trunk.has(vertex)) {
					trunk.set(vertex, { path: vertices, at });
				}
			});
			found.set(edge.id, { points: polyline(path), fromPort, toPort, group });
		}
		routed.set(edge.id, {
			id: edge.id,
			kind: edge.kind,
			from: from.id,
			...(typeof edge.from === "string" ? {} : { fromRow: edge.from.row }),
			to: to.id,
			...(typeof edge.to === "string" ? {} : { toRow: edge.to.row }),
			fromPort,
			toPort,
			route: roundCorners(polyline(path ?? fallbackRoute(fromPort, toPort, [from.box, to.box]))),
			fellBack: path === undefined,
		});
	}
	// Routes that share a grid line spread apart into lanes. Fallback routes
	// keep to their simple shapes.
	const searched = [...found.entries()];
	const nudged = nudge(
		searched.map(([, route]) => route),
		{
			obstacles: [
				...nodes.flatMap(({ box, callout }) =>
					callout === undefined ? [box] : [box, callout.tag],
				),
				...groups.map(({ label }) => label),
			],
			borders: groups.map(({ box }) => box),
		},
		laneSpacing,
	);
	searched.forEach(([id], index) => {
		const edge = routed.get(id);
		const points = nudged[index];
		if (edge !== undefined && points !== undefined) {
			edge.route = roundCorners(polyline(points));
		}
	});
	const edges = diagram.edges.flatMap((edge) => routed.get(edge.id) ?? []);
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
 * For each vertex that a lane group's routes pass, the route that passed it
 * first, as its vertices from its source's stub to its target's, and where
 * the vertex lies on it. The routes of a bundle make a tree, its trunk, that
 * grows toward the sources from the Port they share.
 */
type Trunk = Map<number, { path: number[]; at: number }>;

/**
 * The route the search finds between two Ports' stubs, if it finds one, as
 * its vertices from the source's stub to the target's. The search runs
 * backward, from the target's stub to the source's. Among routes that cost
 * the same, it then finds the one that bends nearest the source, so Edges
 * from one Port fork just past its stub, and Edges into one Port merge well
 * before it.
 *
 * An Edge whose bundle already has routes starts its search anywhere on their
 * trunk instead (spec: Edge routing, step 4), so it ends where it joins the
 * trunk, and follows the trunk from there into the Port. It may join from the
 * side, with a bend, or from behind, but never head-on. A bundle that shares
 * its source Port has its trunk there, so the search runs forward from it.
 */
function searchRoute(
	grid: Grid,
	search: Search,
	fromPort: ScenePort,
	toPort: ScenePort,
	budget: number,
	{ trunk, atSource }: { trunk: Trunk; atSource: boolean },
): number[] | undefined {
	const target = vertexAt(grid, toPort.stub);
	const source = vertexAt(grid, fromPort.stub);
	if (target === undefined || source === undefined) {
		return undefined;
	}
	const costs = { bend: bendCost, crossing: crossingCost, budget };
	const intoTarget: SearchEnd = { vertex: target, heading: opposite[outOf[toPort.side]] };
	const intoSource: SearchEnd = { vertex: source, heading: opposite[outOf[fromPort.side]] };
	if (trunk.size === 0) {
		return search(
			[{ vertex: target, heading: outOf[toPort.side], cost: 0 }],
			intoSource,
			costs,
		)?.reverse();
	}
	// The way the trunk runs at each vertex, from its source end toward its
	// target end. A trunk into a target runs on along the target's stub at its
	// end, and a trunk out of a source ends at other Edges' targets.
	const starts = [...trunk].flatMap(([vertex, { path, at }]): SearchStart[] => {
		const next = path[at + 1];
		const previous = path[at - 1];
		const runs =
			next !== undefined
				? headingBetween(pointOf(grid, vertex), pointOf(grid, next))
				: previous !== undefined && atSource
					? headingBetween(pointOf(grid, previous), pointOf(grid, vertex))
					: atSource
						? outOf[fromPort.side]
						: opposite[outOf[toPort.side]];
		// Joining from behind costs nothing, from the side a bend, and head-on is
		// a U-turn. Going backward, behind is the way the trunk came from.
		const behind = atSource ? runs : opposite[runs];
		return headings.flatMap((heading): SearchStart[] =>
			heading === opposite[behind]
				? []
				: [{ vertex, heading, cost: heading === behind ? 0 : bendCost }],
		);
	});
	const path = search(starts, atSource ? intoTarget : intoSource, costs);
	if (path === undefined) {
		return undefined;
	}
	if (atSource) {
		const joined = trunk.get(path[0] ?? -1);
		return joined === undefined ? path : [...joined.path.slice(0, joined.at), ...path];
	}
	const own = path.reverse();
	const joined = trunk.get(own.at(-1) ?? -1);
	return joined === undefined ? own : [...own, ...joined.path.slice(joined.at + 1)];
}

const headings: Heading[] = ["east", "south", "west", "north"];

/** The heading from one grid vertex to a neighbor on the same line. */
function headingBetween(from: Point, to: Point): Heading {
	if (to.x !== from.x) {
		return to.x > from.x ? "east" : "west";
	}
	return to.y > from.y ? "south" : "north";
}

/**
 * The simple route an Edge falls back to when the search finds none (spec:
 * Edge routing, step 11). If the target lies ahead of the source along the
 * direction, the route runs straight, jogs once halfway between the Ports,
 * and runs on. Otherwise it steps out of the source's Port, moves to a lane
 * beyond both Nodes, travels back past them, and enters the target from its
 * input side.
 *
 * "Along the direction" means the way the Ports' stubs run, which for header
 * Ports is the Diagram's direction. A Row's Ports sit on its Node's left and
 * right sides even on a Diagram drawn `down`. So when one stub runs along x
 * and the other along y, the route joins the ends of the two stubs with a
 * single corner, leaving each stub at a right angle.
 */
function fallbackRoute(fromPort: ScenePort, toPort: ScenePort, nodeBoxes: Box[]): Point[] {
	const alongX = runsAlongX(fromPort.side);
	if (alongX !== runsAlongX(toPort.side)) {
		const corner = alongX
			? { x: fromPort.stub.x, y: toPort.stub.y }
			: { x: toPort.stub.x, y: fromPort.stub.y };
		return [fromPort.point, fromPort.stub, corner, toPort.stub, toPort.point];
	}
	// Worked out as if both stubs ran along x, as for `right`: when they run
	// along y, x and y swap on the way in, and swap back on the way out.
	const turn = alongX ? (point: Point) => point : transpose;
	const start = turn(fromPort.point);
	const out = turn(fromPort.stub);
	const end = turn(toPort.point);
	const into = turn(toPort.stub);
	if (into.x >= out.x) {
		const middle = (start.x + end.x) / 2;
		return [start, { x: middle, y: start.y }, { x: middle, y: end.y }, end].map(turn);
	}
	const boxes = nodeBoxes.map((box) => (alongX ? box : transposeBox(box)));
	const above = Math.min(...boxes.map((box) => box.y)) - clearance / 2;
	const below = Math.max(...boxes.map((box) => box.y + box.height)) + clearance / 2;
	const lane =
		start.y - above + (end.y - above) < below - start.y + (below - end.y) ? above : below;
	return [start, out, { x: out.x, y: lane }, { x: into.x, y: lane }, into, end].map(turn);
}

/** Whether a stub out of this side runs along x. */
function runsAlongX(side: Side): boolean {
	return side === "left" || side === "right";
}

function transpose({ x, y }: Point): Point {
	return { x: y, y: x };
}

function transposeBox({ x, y, width, height }: Box): Box {
	return { x: y, y: x, width: height, height: width };
}

/**
 * The route as a polyline: consecutive steps in the same direction merge into
 * one run, so runs take turns between horizontal and vertical.
 */
function polyline(points: Point[]): Point[] {
	const kept: Point[] = [];
	for (const point of points) {
		const last = kept.at(-1);
		if (last !== undefined && last.x === point.x && last.y === point.y) {
			continue;
		}
		const beforeLast = kept.at(-2);
		if (last !== undefined && beforeLast !== undefined && sameWay(beforeLast, last, point)) {
			kept.pop();
		}
		kept.push(point);
	}
	return kept;
}

/** Whether the step from `b` to `c` goes the same way as the step from `a` to `b`. */
function sameWay(a: Point, b: Point, c: Point): boolean {
	return (
		Math.sign(b.x - a.x) === Math.sign(c.x - b.x) && Math.sign(b.y - a.y) === Math.sign(c.y - b.y)
	);
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
