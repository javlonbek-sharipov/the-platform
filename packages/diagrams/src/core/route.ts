/**
 * Edge routing (spec: Edge routing). Each Edge runs from the end of its
 * source Port's stub to the end of its target Port's stub, along the routing
 * grid, by the cheapest path the search finds. When the search finds none,
 * the Edge falls back to a simple route, and the router warns about it.
 */

import { type Diagram, endNode, type RowEnd } from "../authoring/model.ts";
import { type Bundling, compareText, laneGroups } from "./bundles.ts";
import type { Diagnostic } from "./diagnostics.ts";
import { buildGrid, type Grid, pointOf, vertexAt } from "./grid.ts";
import { strokesOf } from "./hops.ts";
import { placeLabels } from "./labels.ts";
import { clearance } from "./layout.ts";
import { type Corridors, type Nudged, type NudgeRoute, nudge, type Squeeze } from "./nudge.ts";
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
	type Congestion,
	type Heading,
	opposite,
	type Search,
	type SearchEnd,
	type SearchStart,
	searchOn,
	segmentBetween,
} from "./search.ts";

export interface RouteOptions {
	/** Which Edges share a trunk. The architecture Notation bundles by target. */
	bundle?: Bundling;
	/**
	 * How many states each Edge's search may visit. An Edge whose search runs
	 * out falls back to the simple route.
	 */
	searchBudget?: number;
	/**
	 * The labeled Edges that keep lanes of their own, out of their bundles'
	 * trunks, as parallel Edges do.
	 */
	ownLanes?: ReadonlySet<string>;
}

export interface Routing {
	/** One per Edge, in model order. */
	edges: SceneEdge[];
	diagnostics: Diagnostic[];
	/**
	 * The labeled Edges that ride a trunk with no run of their own that holds
	 * their label, which should keep lanes of their own instead.
	 */
	crowdedOut: string[];
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
export const lanes = { spacing: 8, minimum: 4, padding: 8 };

/**
 * Negotiation (spec: Edge routing, step 5): how many times every Edge is
 * routed at most, what stepping onto a segment that's already full costs, and
 * how much lasting cost a segment gains each time a pass leaves it over
 * capacity. Both costs are a little more than a bend's, so that a route takes
 * a detour of a bend or two around a crowded corridor.
 */
const passes = 5;
const fullCost = 48;
const historyCost = 48;

/** How many Group borders the segment between two neighboring vertices crosses. */
function bordersBetween(grid: Grid, a: number, b: number): number {
	const low = Math.min(a, b);
	return (Math.abs(a - b) === 1 ? grid.crossEast[low] : grid.crossSouth[low]) ?? 0;
}

/** The grid segments that lie along a stretch of one of the grid's lines. */
function segmentsAlong(grid: Grid, { horizontal, line, low, high }: Squeeze): number[] {
	const columns = grid.xs.length;
	const lines = horizontal ? grid.ys : grid.xs;
	const stops = horizontal ? grid.xs : grid.ys;
	const at = lines.indexOf(line);
	if (at < 0) {
		return [];
	}
	return stops.flatMap((stop, index) => {
		const next = stops[index + 1];
		if (next === undefined || stop < low || next > high) {
			return [];
		}
		const vertex = horizontal ? at * columns + index : index * columns + at;
		return [2 * vertex + (horizontal ? 0 : 1)];
	});
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
	const grid = buildGrid(nodes, groups, clearance, lanes.spacing);
	const search = searchOn(grid);
	const budget = options.searchBudget ?? defaultSearchBudget;
	const bundle = options.bundle ?? "target";
	const groupOf = laneGroups(diagram, bundle, options.ownLanes);
	// The Group that holds each Node or Group, and each Group's box.
	const parentOf = new Map<string, string>();
	for (const group of diagram.groups) {
		for (const member of group.members) {
			parentOf.set(member, group.id);
		}
	}
	const boxOf = new Map(groups.map((group) => [group.id, group.box]));
	/** The box of the innermost Group that holds both Nodes, if any does. */
	const sharedGroup = (a: string, b: string): Box | undefined => {
		const around = new Set<string>();
		for (let at = parentOf.get(a); at !== undefined; at = parentOf.get(at)) {
			around.add(at);
		}
		for (let at = parentOf.get(b); at !== undefined; at = parentOf.get(at)) {
			if (around.has(at)) {
				return boxOf.get(at);
			}
		}
		return undefined;
	};
	const ends = new Map(
		diagram.edges.map((edge) => {
			const from = byId.get(endNode(edge.from));
			const to = byId.get(endNode(edge.to));
			const fromPort = portOf(edge.from, "output");
			const toPort = portOf(edge.to, "input");
			if (
				from === undefined ||
				to === undefined ||
				fromPort === undefined ||
				toPort === undefined
			) {
				throw new Error(`Edge ${edge.id} ends at a Port that validation should have rejected`);
			}
			return [edge.id, { from, to, fromPort, toPort, within: sharedGroup(from.id, to.id) }];
		}),
	);
	// Edges are routed in a stable order, by bundle and then by id, so that no
	// route depends on the order the Diagram declares its Edges in.
	const order = [...diagram.edges].sort((a, b) => {
		const [groupA = "", groupB = ""] = [groupOf.get(a.id), groupOf.get(b.id)];
		return compareText(groupA, groupB) || compareText(a.id, b.id);
	});
	const segments = 2 * grid.xs.length * grid.ys.length;
	const congestion: Congestion = {
		history: new Float64Array(segments),
		usage: new Uint16Array(segments),
		capacity: grid.capacity,
		own: new Uint32Array(segments),
		stamp: 0,
		full: fullCost,
	};
	const corridors: Corridors = {
		obstacles: [
			...nodes.flatMap(({ box, callout }) => (callout === undefined ? [box] : [box, callout.tag])),
			...groups.map(({ label }) => label),
		],
		borders: groups.map(({ box }) => box),
		ports: [
			...new Map(
				[...ends.values()].flatMap(({ fromPort, toPort }) => [
					[`${fromPort.point.x} ${fromPort.point.y}`, fromPort] as const,
					[`${toPort.point.x} ${toPort.point.y}`, toPort] as const,
				]),
			).values(),
		],
	};
	/** The routes of a pass as the nudging takes them, with the ids of their Edges. */
	const routesOf = (paths: Map<string, number[] | undefined>) => {
		const ids: string[] = [];
		const routes: NudgeRoute[] = [];
		for (const edge of order) {
			const { fromPort, toPort } = ends.get(edge.id) ?? {};
			const vertices = paths.get(edge.id);
			if (fromPort !== undefined && toPort !== undefined && vertices !== undefined) {
				ids.push(edge.id);
				routes.push({
					points: polyline([
						fromPort.point,
						...vertices.map((vertex) => pointOf(grid, vertex)),
						toPort.point,
					]),
					fromPort,
					toPort,
					group: groupOf.get(edge.id) ?? edge.id,
				});
			}
		}
		return { ids, routes };
	};
	// Every Edge is routed, and its route spread into lanes. Then each segment
	// left over capacity gains a lasting cost, as does each segment where lanes
	// had to squeeze closer than the minimum spacing, and every Edge is routed
	// again, until none is over or the passes run out. The pass that left the
	// least over capacity wins.
	let best = {
		paths: new Map<string, number[] | undefined>(),
		ids: [] as string[],
		nudged: { routes: [], squeezed: [] } as Nudged,
	};
	let leastOver = Number.POSITIVE_INFINITY;
	for (let pass = 0; pass < passes; pass += 1) {
		congestion.usage.fill(0);
		const paths = new Map<string, number[] | undefined>();
		const trunks = new Map<string, Trunk>();
		const used = new Map<string, Set<number>>();
		for (const edge of order) {
			const { fromPort, toPort, within } = ends.get(edge.id) ?? {};
			if (fromPort === undefined || toPort === undefined) {
				continue;
			}
			const group = groupOf.get(edge.id) ?? edge.id;
			const trunk = trunks.get(group) ?? new Map();
			trunks.set(group, trunk);
			const own = used.get(group) ?? new Set<number>();
			used.set(group, own);
			congestion.stamp += 1;
			for (const segment of own) {
				congestion.own[segment] = congestion.stamp;
			}
			const vertices = searchRoute(grid, search, fromPort, toPort, budget, {
				trunk,
				atSource: bundle === "source",
				congestion,
				within,
			});
			paths.set(edge.id, vertices);
			// How many Group borders each vertex's part of the trunk crosses: from it
			// on to the target, or from the source to it, for a trunk at the source.
			const crossings = vertices?.map((_, at) =>
				(bundle === "source" ? vertices.slice(0, at + 1) : vertices.slice(at)).reduce(
					(count, vertex, index, part) => {
						const next = part[index + 1];
						return next === undefined ? count : count + bordersBetween(grid, vertex, next);
					},
					0,
				),
			);
			vertices?.forEach((vertex, at) => {
				if (!trunk.has(vertex)) {
					trunk.set(vertex, { path: vertices, at, crossings: crossings?.[at] ?? 0 });
				}
				const next = vertices[at + 1];
				const segment = next === undefined ? undefined : segmentBetween(vertex, next);
				if (segment !== undefined && !own.has(segment)) {
					own.add(segment);
					congestion.usage[segment] = (congestion.usage[segment] ?? 0) + 1;
				}
			});
		}
		let over = 0;
		congestion.usage.forEach((usage, segment) => {
			const excess = usage - (congestion.capacity[segment] ?? 0);
			if (excess > 0) {
				over += excess;
				congestion.history[segment] = (congestion.history[segment] ?? 0) + historyCost;
			}
		});
		const { ids, routes } = routesOf(paths);
		const nudged = nudge(routes, corridors, lanes);
		for (const squeeze of nudged.squeezed) {
			over += 1;
			for (const segment of segmentsAlong(grid, squeeze)) {
				congestion.history[segment] = (congestion.history[segment] ?? 0) + historyCost;
			}
		}
		if (over < leastOver) {
			best = { paths, ids, nudged };
			leastOver = over;
		}
		if (over === 0) {
			break;
		}
	}
	const routed = new Map<string, SceneEdge>();
	for (const edge of order) {
		const { from, to, fromPort, toPort } = ends.get(edge.id) ?? {};
		if (from === undefined || to === undefined || fromPort === undefined || toPort === undefined) {
			continue;
		}
		const vertices = best.paths.get(edge.id);
		const path = vertices && [
			fromPort.point,
			...vertices.map((vertex) => pointOf(grid, vertex)),
			toPort.point,
		];
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
			// The router breaks it at hops once every route is final.
			stroke: [],
			fellBack: path === undefined,
			// Marks come once the labels are placed too.
			chevrons: [],
		});
	}
	// Routes that share a grid line spread apart into lanes, as the winning
	// pass placed them. Fallback routes keep to their simple shapes.
	best.nudged.routes.forEach((points, index) => {
		const edge = routed.get(best.ids[index] ?? "");
		if (edge !== undefined) {
			edge.route = roundCorners(polyline(points));
		}
	});
	const edges = diagram.edges.flatMap((edge) => routed.get(edge.id) ?? []);
	const strokes = strokesOf(edges, diagram.direction);
	edges.forEach((edge, index) => {
		edge.stroke = strokes[index] ?? [edge.route];
	});
	const labeling = placeLabels(diagram, nodes, groups, edges, groupOf);
	for (const edge of edges) {
		const label = labeling.labels.get(edge.id);
		if (label !== undefined) {
			edge.label = label;
		}
	}
	const fallbacks = edges.flatMap(({ id, fellBack }, index): Diagnostic[] =>
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
	return {
		edges,
		diagnostics: [...fallbacks, ...labeling.diagnostics],
		crowdedOut: labeling.crowdedOut,
	};
}

/**
 * For each vertex that a lane group's routes pass, the route that passed it
 * first, as its vertices from its source's stub to its target's, and where
 * the vertex lies on it. The routes of a bundle make a tree, its trunk, that
 * grows toward the sources from the Port they share.
 */
type Trunk = Map<number, { path: number[]; at: number; crossings: number }>;

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
	{
		trunk,
		atSource,
		congestion,
		within,
	}: { trunk: Trunk; atSource: boolean; congestion: Congestion; within: Box | undefined },
): number[] | undefined {
	const target = vertexAt(grid, toPort.stub);
	const source = vertexAt(grid, fromPort.stub);
	if (target === undefined || source === undefined) {
		return undefined;
	}
	const costs = { bend: bendCost, crossing: crossingCost, budget, congestion };
	const intoTarget: SearchEnd = { vertex: target, heading: opposite[outOf[toPort.side]] };
	const intoSource: SearchEnd = { vertex: source, heading: opposite[outOf[fromPort.side]] };
	if (trunk.size === 0) {
		return search(
			[{ vertex: target, heading: outOf[toPort.side], cost: 0 }],
			intoSource,
			costs,
		)?.reverse();
	}
	// Starting on the trunk costs the Group borders that the trunk crosses on
	// the way, since the route crosses them too. A route between two Nodes of
	// one Group joins the trunk inside that Group, so that it stays inside.
	const inside = (vertex: number) => {
		const { x, y } = pointOf(grid, vertex);
		return (
			within === undefined ||
			(within.x < x && x < within.x + within.width && within.y < y && y < within.y + within.height)
		);
	};
	const starts = [...trunk].flatMap(([vertex, { path, at, crossings }]): SearchStart[] => {
		if (!inside(vertex)) {
			return [];
		}
		// The way the trunk runs at each vertex, from its source end toward its
		// target end. A trunk into a target runs on along the target's stub at
		// its end, and a trunk out of a source ends at other Edges' targets.
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
				: [
						{
							vertex,
							heading,
							cost: (heading === behind ? 0 : bendCost) + crossings * crossingCost,
						},
					],
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
