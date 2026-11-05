/**
 * Nudging (spec: Edge routing, steps 6 and 7). The search leaves every route
 * on the routing grid's lines, so routes that share a line overlap. Nudging
 * spreads them into lanes beside the line, then offsets each run of every
 * route by its lane.
 *
 * On each line, the runs of one lane group (one bundle) that overlap or meet
 * make one stretch. Stretches of different groups that overlap form an
 * overlap set, which is sorted so that its lanes don't cross, then spaced
 * evenly around the line, squeezed in a narrow corridor so that every lane
 * stays inside it with some padding.
 *
 * A route's first run starts at its source's Port, along the Port's stub, and
 * its last run ends at its target's. A run that turns away from a stub's end
 * may cut into the stub, leaving at least the padding of it. A first or last
 * run that carries on straight past the stub keeps the stub's line where it
 * can, and otherwise jogs to its lane at or past the stub's end.
 */

import { headingOf, type LineSpan } from "./geometry.ts";
import type { Box, Point, ScenePort } from "./scene.ts";

export interface NudgeRoute {
	/**
	 * The route's corners on the grid, from its source's Port to its target's,
	 * so that its runs take turns between horizontal and vertical.
	 */
	points: Point[];
	fromPort: ScenePort;
	toPort: ScenePort;
	/** Routes of one lane group may share a lane, as a bundle's trunk does. */
	laneGroup: string;
}

export interface Corridors {
	/** What no lane may come near: Nodes, callouts' tags and Group labels. */
	obstacles: Box[];
	/** Group boxes, whose borders lanes keep clear of too. */
	borders: Box[];
	/**
	 * The Ports that Edges use. Each one's stub is an obstacle to the lanes of
	 * other Ports: a lane beside it keeps to its far end, or beyond.
	 */
	ports: ScenePort[];
}

export interface LaneSpacing {
	/** How far apart neighboring lanes are, where there's room. */
	spacing: number;
	/** How far apart they stay in a narrow corridor. */
	minimum: number;
	/** How far every lane stays from the corridor's sides. */
	padding: number;
}

/** A run of a route: a straight stretch from one corner to the next, on its line. */
interface Run extends LineSpan {
	route: number;
	index: number;
	from: Point;
	to: Point;
	/** Whether it's only a Port's stub: a first run that turns at the stub's end, or the like last run. */
	stubOnly: boolean;
}

/** The stretch of one line that one lane group uses, which takes one lane. */
interface Stretch extends LineSpan {
	laneGroup: string;
	runs: Run[];
	/** How much it would rather keep its line, as `keepsLine` ranks it. */
	pinned: number;
	/** Whether it must keep its line, as a Port's junction does. */
	fixed: boolean;
	/** Whether its corners at its low and high ends stay put, being where it leaves a stub. */
	fixedLow: boolean;
	fixedHigh: boolean;
	/** Where its lane may go, across the line, keeping clear of other Ports' stubs. */
	lowest: number;
	highest: number;
	/** Where its lane may go at most: clear of obstacles and Group borders, if not of stubs. */
	hardLowest: number;
	hardHighest: number;
	offset: number;
	/** Whether its set's lanes had to squeeze closer than the minimum spacing. */
	squeezed: boolean;
}

/**
 * How many times nudging runs at most, each time with the junctions that the
 * time before found, until no junction reaches further.
 */
const rounds = 3;

/**
 * How much a stretch would rather keep its line, so that an overlap set's
 * lanes keep on it the lane of the stretch that would most rather: a Port's
 * junction most, then a route that runs straight from stub to stub, which
 * would jog at both ends, then a first or last run that carries a stub
 * straight on, which would jog at one, and least, any other.
 */
const keepsLine = { junction: 3, bothStubs: 2, oneStub: 1, none: 0 } as const;

/** A stretch of a grid line whose lanes had to squeeze closer than the minimum spacing. */
export type Squeeze = LineSpan;

export interface Nudged {
	/** Each route's corners, offset into its lanes, in the order of the routes given. */
	routes: Point[][];
	/** Where lanes squeezed closer than the minimum spacing: corridors that hold more lanes than fit. */
	squeezed: Squeeze[];
}

export function nudge(routes: NudgeRoute[], corridors: Corridors, lanes: LaneSpacing): Nudged {
	const runs = routes.map(runsOf);
	let junctions = new Map<string, Junction>();
	let offsetOf = (_: Run) => 0;
	let jogs = new Map<string, Jog>();
	let squeezed: Squeeze[] = [];
	for (let round = 0; round < rounds; round += 1) {
		const arranged = arrange(routes, runs, [...junctions.values()], corridors, lanes);
		const { offsets } = arranged;
		squeezed = arranged.squeezed;
		offsetOf = (run: Run) => offsets.get(run) ?? 0;
		jogs = jogsOf(routes, runs, offsetOf);
		placeJogs(jogs, routes, runs, offsetOf, lanes);
		const reached = junctionsOf(routes, runs, offsetOf, jogs, junctions);
		const grew = [...reached].some(([key, { reach }]) => reach > (junctions.get(key)?.reach ?? 0));
		if (!grew) {
			break;
		}
		junctions = reached;
	}
	return {
		routes: routes.map((route, index) =>
			offsetRoute(
				route,
				runs[index] ?? [],
				offsetOf,
				(end) => jogs.get(`${index} ${end}`)?.along ?? 0,
			),
		),
		squeezed,
	};
}

/**
 * A Port's junction: the stretch of its stub's line just past the stub's
 * end, where the Port's Edges turn off the line or jog to their lanes. It
 * stays at the stub's height, and only the Port's own Edges use it, so other
 * Edges' lanes keep off it.
 */
interface Junction {
	port: Point;
	end: End;
	horizontal: boolean;
	line: number;
	/** The stub's end, along the line. */
	start: number;
	/** Which way along the line is out of the Node: 1 or -1. */
	out: number;
	/** How far past the stub's end the junction reaches. */
	reach: number;
}

/** Each run's offset across its line, from spreading every line's stretches into lanes. */
function arrange(
	routes: NudgeRoute[],
	runs: Run[][],
	junctions: Junction[],
	corridors: Corridors,
	lanes: LaneSpacing,
): { offsets: Map<Run, number>; squeezed: Squeeze[] } {
	// A junction is a stretch of its own, with a run that stands for the stub's
	// line from the Port out to its reach, unless a stretch of the Port's own
	// Edges carries the stub straight through it, and then that one holds it.
	const pseudo = junctions.map((junction, index): Run => {
		const near = { x: junction.port.x, y: junction.port.y };
		const far = junction.horizontal
			? { x: junction.start + junction.out * junction.reach, y: junction.line }
			: { x: junction.line, y: junction.start + junction.out * junction.reach };
		const [from, to] = junction.end === "first" ? [near, far] : [far, near];
		const [a, b] = junction.horizontal ? [from.x, to.x] : [from.y, to.y];
		return {
			route: routes.length + index,
			index: 0,
			horizontal: junction.horizontal,
			line: junction.line,
			from,
			to,
			low: Math.min(a, b),
			high: Math.max(a, b),
			stubOnly: false,
		};
	});
	const allRuns = [...runs, ...pseudo.map((run) => [run])];
	const stretches = stretchesOf(runs.flat(), routes);
	junctions.forEach((junction, index) => {
		const run = pseudo[index];
		if (run === undefined) {
			return;
		}
		const own = stretches
			.filter(
				(stretch) =>
					stretch.horizontal === run.horizontal &&
					stretch.line === run.line &&
					stretch.low <= run.high &&
					stretch.high >= run.low &&
					stretch.runs.every((candidate) => atJunction(candidate, junction, routes)) &&
					pseudo.every(
						(other) =>
							other === run ||
							other.horizontal !== stretch.horizontal ||
							other.line !== stretch.line ||
							other.high < stretch.low ||
							other.low > stretch.high,
					),
			)
			.sort((a, b) => b.pinned - a.pinned)[0];
		const holder = own ?? {
			horizontal: run.horizontal,
			line: run.line,
			low: run.low,
			high: run.high,
			laneGroup: `junction ${junction.end} ${junction.port.x} ${junction.port.y}`,
			runs: [run],
			pinned: keepsLine.none,
			fixed: false,
			fixedLow: true,
			fixedHigh: true,
			lowest: run.line,
			highest: run.line,
			hardLowest: run.line,
			hardHighest: run.line,
			offset: 0,
			squeezed: false,
		};
		holder.low = Math.min(holder.low, run.low);
		holder.high = Math.max(holder.high, run.high);
		holder.fixed = true;
		holder.pinned = keepsLine.junction;
		if (own === undefined) {
			stretches.push(holder);
		}
	});
	for (const stretch of stretches) {
		limit(stretch, runs, routes, corridors, lanes);
	}
	const sorted = overlapSets(stretches).map((set) => sortSet(set, allRuns));
	for (const joined of shareRoom(sorted, lanes)) {
		place(joined, lanes);
	}
	const offsets = new Map<Run, number>();
	for (const stretch of stretches) {
		for (const run of stretch.runs) {
			offsets.set(run, stretch.offset);
		}
	}
	const squeezed = stretches
		.filter((stretch) => stretch.squeezed && stretch.runs.length > 0 && !stretch.fixed)
		.map(({ horizontal, line, low, high }) => ({ horizontal, line, low, high }));
	return { offsets, squeezed };
}

/** Whether a run is one that a Port's Edge takes through the Port's junction: its first run out of the Port, or its last run in. */
function atJunction(run: Run, junction: Junction, routes: NudgeRoute[]): boolean {
	const route = routes[run.route];
	if (route === undefined) {
		return false;
	}
	return junction.end === "first"
		? run.index === 0 && same(route.fromPort.point, junction.port)
		: run.index === route.points.length - 2 && same(route.toPort.point, junction.port);
}

/**
 * How far each Port's junction reaches: past the stub's end, as far as any of
 * its Edges turns off the stub's line, or jogs off it. A junction never
 * shrinks from one round to the next.
 */
function junctionsOf(
	routes: NudgeRoute[],
	runs: Run[][],
	offsetOf: (run: Run) => number,
	jogs: Map<string, Jog>,
	known: Map<string, Junction>,
): Map<string, Junction> {
	const junctions = new Map(known);
	routes.forEach((route, index) => {
		const routeRuns = runs[index] ?? [];
		for (const end of ["first", "last"] as const) {
			const port = end === "first" ? route.fromPort : route.toPort;
			const stub = end === "first" ? routeRuns[0] : routeRuns.at(-1);
			const turn = end === "first" ? routeRuns[1] : routeRuns.at(-2);
			const out = headingOf(port.point, port.stub);
			let reach = jogs.get(`${index} ${end}`)?.along ?? 0;
			if (stub?.stubOnly === true && turn !== undefined) {
				reach = Math.max(reach, offsetOf(turn) * (turn.horizontal ? out.y : out.x));
			}
			if (!(reach > 0)) {
				continue;
			}
			const key = `${end} ${port.point.x} ${port.point.y}`;
			const horizontal = out.y === 0;
			junctions.set(key, {
				port: port.point,
				end,
				horizontal,
				line: horizontal ? port.stub.y : port.stub.x,
				start: horizontal ? port.stub.x : port.stub.y,
				out: horizontal ? out.x : out.y,
				reach: Math.max(junctions.get(key)?.reach ?? 0, reach),
			});
		}
	});
	return junctions;
}

function runsOf(route: NudgeRoute, index: number): Run[] {
	const { points, fromPort, toPort } = route;
	const last = points.length - 2;
	return points.slice(1).map((to, at): Run => {
		const from = points[at] ?? to;
		const horizontal = from.y === to.y;
		const [a, b] = horizontal ? [from.x, to.x] : [from.y, to.y];
		return {
			route: index,
			index: at,
			horizontal,
			line: horizontal ? from.y : from.x,
			from,
			to,
			low: Math.min(a, b),
			high: Math.max(a, b),
			stubOnly:
				(at === 0 && same(to, fromPort.stub) && at !== last) ||
				(at === last && same(from, toPort.stub) && at !== 0),
		};
	});
}

function same(a: Point, b: Point): boolean {
	return a.x === b.x && a.y === b.y;
}

/**
 * The stretches on every line: each lane group's runs on the line, joined
 * where they overlap or meet. A stub on its own takes no lane.
 */
function stretchesOf(runs: Run[], routes: NudgeRoute[]): Stretch[] {
	const byLine = new Map<string, Run[]>();
	for (const run of runs) {
		if (!run.stubOnly) {
			const key = `${run.horizontal ? "h" : "v"}${run.line}`;
			byLine.set(key, [...(byLine.get(key) ?? []), run]);
		}
	}
	const stretches: Stretch[] = [];
	for (const lineRuns of byLine.values()) {
		const byGroup = new Map<string, Run[]>();
		for (const run of lineRuns) {
			const laneGroup = routes[run.route]?.laneGroup ?? "";
			byGroup.set(laneGroup, [...(byGroup.get(laneGroup) ?? []), run]);
		}
		for (const [laneGroup, groupRuns] of byGroup) {
			groupRuns.sort((a, b) => a.low - b.low || a.high - b.high);
			let current: Stretch | undefined;
			for (const run of groupRuns) {
				if (current !== undefined && run.low <= current.high) {
					current.high = Math.max(current.high, run.high);
					current.runs.push(run);
					continue;
				}
				current = {
					horizontal: run.horizontal,
					line: run.line,
					low: run.low,
					high: run.high,
					laneGroup,
					runs: [run],
					pinned: keepsLine.none,
					fixed: false,
					fixedLow: false,
					fixedHigh: false,
					lowest: run.line,
					highest: run.line,
					hardLowest: run.line,
					hardHighest: run.line,
					offset: 0,
					squeezed: false,
				};
				stretches.push(current);
			}
		}
	}
	for (const stretch of stretches) {
		stretch.pinned = Math.max(
			keepsLine.none,
			...stretch.runs.map((run) => stubsCarried(run, routes)),
		);
	}
	return stretches;
}

/**
 * How much a run would rather keep its line, by the Ports' stubs it carries
 * straight on: as a route's first run, its last, or both.
 */
function stubsCarried(run: Run, routes: NudgeRoute[]): number {
	const last = (routes[run.route]?.points.length ?? 0) - 2;
	const first = run.index === 0;
	const final = run.index === last;
	return first && final ? keepsLine.bothStubs : first || final ? keepsLine.oneStub : keepsLine.none;
}

/**
 * Where a stretch's lane may go across its line: clear of every obstacle and
 * Group border beside it, by the padding. A stretch that turns away from a
 * stub's end has the stub's Node beside it, so it may cut into the stub, but
 * leaves at least the padding of it.
 */
function limit(
	stretch: Stretch,
	runs: Run[][],
	routes: NudgeRoute[],
	corridors: Corridors,
	lanes: LaneSpacing,
): void {
	const { horizontal, line, low, high } = stretch;
	if (stretch.fixed) {
		stretch.lowest = line;
		stretch.highest = line;
		stretch.hardLowest = line;
		stretch.hardHighest = line;
		stretch.fixedLow = true;
		stretch.fixedHigh = true;
		return;
	}
	let below = Number.NEGATIVE_INFINITY;
	let above = Number.POSITIVE_INFINITY;
	const across = (box: Box) =>
		horizontal ? [box.y, box.y + box.height] : [box.x, box.x + box.width];
	const along = (box: Box) =>
		horizontal ? [box.x, box.x + box.width] : [box.y, box.y + box.height];
	for (const box of corridors.obstacles) {
		const [start = 0, end = 0] = along(box);
		const [near = 0, far = 0] = across(box);
		if (start < high && end > low) {
			if (far <= line) {
				below = Math.max(below, far + lanes.padding);
			} else if (near >= line) {
				above = Math.min(above, near - lanes.padding);
			}
		}
	}
	for (const box of corridors.borders) {
		const [start = 0, end = 0] = along(box);
		if (start < high && end > low) {
			for (const side of across(box)) {
				if (side < line) {
					below = Math.max(below, side + lanes.padding);
				} else if (side > line) {
					above = Math.min(above, side - lanes.padding);
				}
			}
		}
	}
	stretch.hardLowest = Math.min(below, line);
	stretch.hardHighest = Math.max(above, line);
	// A stub across the line, within the stretch's span, keeps the lane at its
	// far end or beyond, unless the stretch belongs to an Edge at that Port,
	// which may cut into its own stub as far as the padding.
	for (const port of corridors.ports) {
		const stubAcross = horizontal ? port.point.x === port.stub.x : port.point.y === port.stub.y;
		const at = horizontal ? port.point.x : port.point.y;
		if (
			!stubAcross ||
			at < low ||
			at > high ||
			stretch.runs.some((run) => atPort(run, port, routes))
		) {
			continue;
		}
		const [near, far] = horizontal ? [port.point.y, port.stub.y] : [port.point.x, port.stub.x];
		if (Math.max(near, far) <= line) {
			below = Math.max(below, Math.max(near, far));
		} else if (Math.min(near, far) >= line) {
			above = Math.min(above, Math.min(near, far));
		}
	}
	stretch.lowest = Math.min(below, line);
	stretch.highest = Math.max(above, line);
	stretch.fixedLow = stretch.runs
		.filter((run) => run.low === low)
		.every((run) => leavesStubAt(run, low, runs[run.route] ?? []));
	stretch.fixedHigh = stretch.runs
		.filter((run) => run.high === high)
		.every((run) => leavesStubAt(run, high, runs[run.route] ?? []));
}

/** Whether a run belongs to an Edge that leaves or enters at a Port. */
function atPort(run: Run, port: ScenePort, routes: NudgeRoute[]): boolean {
	const route = routes[run.route];
	return (
		route !== undefined &&
		(same(route.fromPort.point, port.point) || same(route.toPort.point, port.point))
	);
}

/** Whether a run meets a stub on its own at the given end, where its corner can't move along it. */
function leavesStubAt(run: Run, end: number, routeRuns: Run[]): boolean {
	const before = routeRuns[run.index - 1];
	const after = routeRuns[run.index + 1];
	const start = run.horizontal ? run.from.x : run.from.y;
	return start === end ? before?.stubOnly === true : after?.stubOnly === true;
}

/**
 * The overlap sets on each line: stretches that overlap, or meet at a point
 * where either one's corner can move, together with every stretch that
 * overlaps those, in the order of their starts along the line.
 */
function overlapSets(stretches: Stretch[]): Stretch[][] {
	const byLine = new Map<string, Stretch[]>();
	for (const stretch of stretches) {
		const key = `${stretch.horizontal ? "h" : "v"}${stretch.line}`;
		byLine.set(key, [...(byLine.get(key) ?? []), stretch]);
	}
	const sets: Stretch[][] = [];
	for (const lineStretches of byLine.values()) {
		lineStretches.sort((a, b) => a.low - b.low || a.high - b.high);
		const joined = disjointSets(lineStretches.length);
		lineStretches.forEach((a, i) => {
			for (let j = i + 1; j < lineStretches.length; j += 1) {
				const b = lineStretches[j];
				if (b !== undefined && overlaps(a, b)) {
					joined.join(i, j);
				}
			}
		});
		sets.push(...joined.sets().map((set) => set.flatMap((index) => lineStretches[index] ?? [])));
	}
	return sets;
}

/**
 * Indices from 0 to `count` - 1, joined pair by pair into disjoint sets: each
 * set lists its indices in order, and the sets come in the order of their
 * first indices.
 */
function disjointSets(count: number): { join(a: number, b: number): void; sets(): number[][] } {
	const root = Array.from({ length: count }, (_, index) => index);
	const find = (index: number): number => {
		let at = index;
		while (root[at] !== at) {
			at = root[at] ?? at;
		}
		return at;
	};
	return {
		join(a, b) {
			root[find(b)] = find(a);
		},
		sets() {
			const byRoot = new Map<number, number[]>();
			root.forEach((_, index) => {
				const key = find(index);
				byRoot.set(key, [...(byRoot.get(key) ?? []), index]);
			});
			return [...byRoot.values()];
		},
	};
}

/**
 * Sorts an overlap set from its lowest lane to its highest, so that lanes
 * don't cross where they needn't. An insertion sort, so that the order is the
 * same in every JavaScript engine, even where crossings can't be avoided and
 * the comparisons disagree.
 */
function sortSet(set: Stretch[], runs: Run[][]): Stretch[] {
	const sorted: Stretch[] = [];
	for (const stretch of set) {
		let at = sorted.length;
		while (at > 0 && compare(sorted[at - 1] as Stretch, stretch, runs) > 0) {
			at -= 1;
		}
		sorted.splice(at, 0, stretch);
	}
	return sorted;
}

/**
 * Whether stretch `a` belongs below stretch `b`, across their line (-1), or
 * above it (1). It compares the runs of each that overlap the most.
 */
function compare(a: Stretch, b: Stretch, runs: Run[][]): number {
	// Limits come first: a stretch that must keep to one side of the line,
	// such as a turn at a stub's end, which keeps to the stub's outer side,
	// goes below one that must keep to the other.
	if (a.highest <= b.lowest && a.lowest < b.highest) {
		return -1;
	}
	if (b.highest <= a.lowest && b.lowest < a.highest) {
		return 1;
	}
	let best: [Run, Run] | undefined;
	let most = Number.NEGATIVE_INFINITY;
	for (const runA of a.runs) {
		for (const runB of b.runs) {
			const overlap = Math.min(runA.high, runB.high) - Math.max(runA.low, runB.low);
			if (overlap > most) {
				most = overlap;
				best = [runA, runB];
			}
		}
	}
	if (best === undefined) {
		return 0;
	}
	const [runA, runB] = best;
	const order = sideOf(runA, runB, runs);
	if (order !== 0) {
		return order;
	}
	const heading = travelOf(runA, 1);
	return (a.laneGroup < b.laneGroup ? 1 : -1) * leftward(runA.horizontal, heading);
}

/** A unit vector along a run, the way the route travels, or the other way for `step` -1. */
function travelOf(run: Run, step: number): Point {
	return {
		x: Math.sign(run.to.x - run.from.x) * step,
		y: Math.sign(run.to.y - run.from.y) * step,
	};
}

/**
 * Which way across the line is to a traveler's left, heading as given: -1
 * toward lower coordinates, 1 toward higher. With y pointing down, heading
 * east has north on the left.
 */
function leftward(horizontal: boolean, heading: Point): number {
	return horizontal ? -heading.x : heading.y;
}

/**
 * Which side of `b` run `a` belongs on, across their line: -1 below, 1 above,
 * 0 when nothing tells. Follow both routes along `a`'s heading until they
 * part: the route that turns left there, while the other goes straight or
 * turns right, runs to the left all along the stretch they share, since a
 * shared path keeps its left and right through every corner. If they never
 * part that way, follow them back the other way.
 */
function sideOf(a: Run, b: Run, runs: Run[][]): number {
	for (const step of [1, -1]) {
		const heading = travelOf(a, step);
		const left = walk(a, b, step, runs);
		if (left !== 0) {
			return left * leftward(a.horizontal, heading);
		}
	}
	return 0;
}

/**
 * Walks two routes that share a line from runs `a` and `b`, in `a`'s
 * direction of travel for `step` 1 and against it for -1, until they part.
 * Returns 1 if `a`'s route keeps to the left of `b`'s, -1 if to the right,
 * and 0 if they never part.
 */
function walk(a: Run, b: Run, step: number, runs: Run[][]): number {
	const routeA = runs[a.route] ?? [];
	const routeB = runs[b.route] ?? [];
	const headingA = travelOf(a, step);
	const sameWay = (() => {
		const headingB = travelOf(b, 1);
		return headingA.x === headingB.x && headingA.y === headingB.y;
	})();
	const stepB = sameWay ? 1 : -1;
	let atA = a.index;
	let atB = b.index;
	for (let guard = 0; guard < routeA.length + routeB.length; guard += 1) {
		const runA = routeA[atA];
		const runB = routeB[atB];
		if (runA === undefined || runB === undefined) {
			return 0;
		}
		const heading = travelOf(runA, step);
		const endA = step > 0 ? runA.to : runA.from;
		const endB = stepB > 0 ? runB.to : runB.from;
		const reachA = endA.x * heading.x + endA.y * heading.y;
		const reachB = endB.x * heading.x + endB.y * heading.y;
		const turnA = turnAt(routeA[atA + step], step, heading);
		const turnB = turnAt(routeB[atB + stepB], stepB, heading);
		if (reachA < reachB) {
			return turnA;
		}
		if (reachB < reachA) {
			return -turnB;
		}
		if (turnA !== turnB || turnA === 0) {
			return Math.sign(turnA - turnB);
		}
		atA += step;
		atB += stepB;
	}
	return 0;
}

/** Whether the next run turns left (1) or right (-1) from `heading`, or 0 if there's none. */
function turnAt(next: Run | undefined, step: number, heading: Point): number {
	if (next === undefined) {
		return 0;
	}
	const turned = travelOf(next, step);
	// With y pointing down, left of heading (x, y) is (y, -x).
	return turned.x === heading.y && turned.y === -heading.x ? 1 : -1;
}

/**
 * The lane of each stretch of a sorted overlap set. Walking the set from its
 * lowest stretch, each one takes the lowest lane above every earlier stretch
 * it overlaps, so stretches that don't overlap may share a lane.
 */
function lanesOf(sorted: Stretch[]): number[] {
	const laneOf: number[] = [];
	sorted.forEach((stretch, index) => {
		let lane = 0;
		for (let earlier = 0; earlier < index; earlier += 1) {
			const other = sorted[earlier];
			if (other !== undefined && overlaps(other, stretch)) {
				lane = Math.max(lane, (laneOf[earlier] ?? 0) + 1);
			}
		}
		laneOf.push(lane);
	});
	return laneOf;
}

/**
 * Where a sorted overlap set's lanes go: the first lane's position across
 * the line, and the gap between neighboring lanes, which is at most `widest`.
 * The lanes are spaced evenly, as far apart as every stretch's limits allow,
 * up to `widest`. They're centered on the line, or keep on it the lane of the
 * stretch that would most rather keep the line: a Port's junction, then a
 * route that runs straight from stub to stub.
 */
function spread(
	sorted: Stretch[],
	laneOf: number[],
	widest: number,
	lanes: LaneSpacing,
): { positions: number[]; gap: number; feasible: boolean } {
	const line = sorted[0]?.line ?? 0;
	const count = Math.max(0, ...laneOf) + 1;
	// The lanes center on the line, or for sets of several lines, on the mean
	// of their lines, each lane weighing as one.
	const center = (() => {
		const lineOf = new Map<number, number>();
		sorted.forEach((stretch, index) => {
			lineOf.set(laneOf[index] ?? 0, stretch.line);
		});
		const lines = [...lineOf.values()];
		return lines.length === 0
			? line
			: lines.reduce((total, value) => total + value, 0) / lines.length;
	})();
	const lowest = new Array<number>(count).fill(Number.NEGATIVE_INFINITY);
	const highest = new Array<number>(count).fill(Number.POSITIVE_INFINITY);
	sorted.forEach((stretch, index) => {
		const lane = laneOf[index] ?? 0;
		lowest[lane] = Math.max(lowest[lane] ?? 0, stretch.lowest);
		highest[lane] = Math.min(highest[lane] ?? 0, stretch.highest);
	});
	let room = Number.POSITIVE_INFINITY;
	for (let i = 0; i < count; i += 1) {
		for (let j = i + 1; j < count; j += 1) {
			room = Math.min(room, ((highest[j] ?? line) - (lowest[i] ?? line)) / (j - i));
		}
	}
	const feasible = room > 0;
	const gap = feasible ? Math.min(widest, room) : lanes.minimum;
	const most = Math.max(...sorted.map((stretch) => stretch.pinned));
	const keeper = most > 0 ? sorted.findIndex((stretch) => stretch.pinned === most) : -1;
	const wanted =
		keeper >= 0
			? (sorted[keeper]?.line ?? line) - (laneOf[keeper] ?? 0) * gap
			: center - ((count - 1) * gap) / 2;
	// Each lane goes as near its place in the evenly spaced set as its limits
	// allow, keeping at least the gap from the lanes on either side: past the
	// lower limits of the lanes below it, and short of the upper limits of the
	// lanes above it, each as far as the gap requires.
	const floor: number[] = [];
	const ceiling: number[] = [];
	for (let lane = 0; lane < count; lane += 1) {
		floor.push(
			Math.max(floor[lane - 1] ?? Number.NEGATIVE_INFINITY, (lowest[lane] ?? line) - lane * gap),
		);
	}
	for (let lane = count - 1; lane >= 0; lane -= 1) {
		ceiling[lane] = Math.min(
			ceiling[lane + 1] ?? Number.POSITIVE_INFINITY,
			(highest[lane] ?? line) - lane * gap,
		);
	}
	const positions = floor.map((low, lane) => {
		const high = ceiling[lane] ?? Number.POSITIVE_INFINITY;
		return lane * gap + (low <= high ? Math.min(Math.max(wanted, low), high) : wanted);
	});
	return { positions, gap, feasible };
}

/**
 * Spaces sorted overlap sets that are placed as one into lanes, at the
 * preferred spacing where there's room: one set, or sets of neighboring lines too
 * close for their lanes, which are placed as one: the lower line's lanes
 * below the upper line's. Where keeping clear of other Ports' stubs would
 * squeeze the lanes below the minimum spacing, they keep clear only of
 * obstacles and borders, and cross those stubs instead.
 */
function place(joined: Stretch[][], lanes: LaneSpacing): void {
	const sets = [...joined].sort((a, b) => (a[0]?.line ?? 0) - (b[0]?.line ?? 0));
	const sorted = sets.flat();
	const laneOf: number[] = [];
	let base = 0;
	for (const set of sets) {
		const own = lanesOf(set);
		laneOf.push(...own.map((lane) => lane + base));
		base += Math.max(0, ...own) + 1;
	}
	let placed = spread(sorted, laneOf, lanes.spacing, lanes);
	const fits = (result: typeof placed) => result.feasible && result.gap >= lanes.minimum;
	if (!fits(placed) && laneOf.some((lane) => lane > 0)) {
		const soft = sorted.map(({ lowest, highest }) => [lowest, highest] as const);
		for (const stretch of sorted) {
			stretch.lowest = stretch.hardLowest;
			stretch.highest = stretch.hardHighest;
		}
		const hard = spread(sorted, laneOf, lanes.spacing, lanes);
		// A placement that keeps every limit beats one that doesn't, then the
		// wider spacing wins.
		const better = hard.feasible !== placed.feasible ? hard.feasible : hard.gap > placed.gap;
		if (better) {
			placed = hard;
		} else {
			sorted.forEach((stretch, index) => {
				[stretch.lowest, stretch.highest] = soft[index] ?? [stretch.lowest, stretch.highest];
			});
		}
	}
	const { positions } = placed;
	const squeezed = !fits(placed) && laneOf.some((lane) => lane > 0);
	sorted.forEach((stretch, index) => {
		stretch.offset = (positions[laneOf[index] ?? 0] ?? stretch.line) - stretch.line;
		stretch.squeezed = squeezed;
	});
}

/** How far a sorted overlap set's lanes reach below and above its line, with gaps of at most `widest`. */
function reachOf(sorted: Stretch[], widest: number, lanes: LaneSpacing): [number, number] {
	const line = sorted[0]?.line ?? 0;
	const laneOf = lanesOf(sorted);
	const { positions } = spread(sorted, laneOf, widest, lanes);
	return [Math.max(0, line - Math.min(...positions)), Math.max(0, Math.max(...positions) - line)];
}

/**
 * Shares the room between the lanes of neighboring lines. Where two overlap
 * sets on different lines run beside each other, a boundary between them
 * keeps the lanes of each to its own side, the minimum spacing apart. It
 * leaves each set the room it needs at the minimum spacing, and shares what's
 * left as each would use it at the preferred spacing. Where even the minimum
 * doesn't fit, each gets room in proportion to its need.
 */
function shareRoom(sets: Stretch[][], lanes: LaneSpacing): Stretch[][][] {
	const span = (set: Stretch[]): [number, number] => [
		Math.min(...set.map((stretch) => stretch.low)),
		Math.max(...set.map((stretch) => stretch.high)),
	];
	const needs = sets.map((set) => ({
		least: reachOf(set, lanes.minimum, lanes),
		most: reachOf(set, lanes.spacing, lanes),
		span: span(set),
	}));
	const bounds: [number, number][] = sets.map(() => [
		Number.NEGATIVE_INFINITY,
		Number.POSITIVE_INFINITY,
	]);
	const placedAsOne = disjointSets(sets.length);
	sets.forEach((lower, i) => {
		sets.forEach((upper, j) => {
			const [a, b] = [lower[0], upper[0]];
			const [needA, needB] = [needs[i], needs[j]];
			if (
				a === undefined ||
				b === undefined ||
				needA === undefined ||
				needB === undefined ||
				a.horizontal !== b.horizontal ||
				a.line >= b.line ||
				needA.span[0] > needB.span[1] ||
				needB.span[0] > needA.span[1] ||
				a.laneGroup === b.laneGroup
			) {
				return;
			}
			const distance = b.line - a.line;
			const [leastA, leastB] = [needA.least[1], needB.least[0]];
			const [mostA, mostB] = [needA.most[1], needB.most[0]];
			const slack = distance - lanes.minimum - leastA - leastB;
			if (slack < 0) {
				// Too close for their lanes even at the minimum spacing: they're placed
				// as one, the lower line's lanes below the upper line's.
				placedAsOne.join(i, j);
				return;
			}
			const [wantA, wantB] = [mostA - leastA, mostB - leastB];
			const share = wantA + wantB > 0 ? wantA / (wantA + wantB) : 0.5;
			const boundA = a.line + leastA + slack * share;
			const below = bounds[i];
			const above = bounds[j];
			if (below !== undefined && above !== undefined) {
				below[1] = Math.min(below[1], Math.max(a.line, boundA));
				above[0] = Math.max(above[0], Math.min(b.line, boundA + lanes.minimum));
			}
		});
	});
	sets.forEach((set, index) => {
		const [low, high] = bounds[index] ?? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
		for (const stretch of set) {
			if (!stretch.fixed) {
				stretch.lowest = Math.max(stretch.lowest, Math.min(low, stretch.line));
				stretch.highest = Math.min(stretch.highest, Math.max(high, stretch.line));
				stretch.hardLowest = Math.max(stretch.hardLowest, Math.min(low, stretch.line));
				stretch.hardHighest = Math.min(stretch.hardHighest, Math.max(high, stretch.line));
			}
		}
	});
	return placedAsOne
		.sets()
		.map((indices) => indices.flatMap((index) => (sets[index] === undefined ? [] : [sets[index]])));
}

/**
 * Whether two stretches of one line overlap, or meet at a point where either
 * one's corner can move along the line.
 */
function overlaps(a: Stretch, b: Stretch): boolean {
	if (a.low < b.high && b.low < a.high) {
		return true;
	}
	if (a.high === b.low) {
		return !(a.fixedHigh && b.fixedLow);
	}
	if (b.high === a.low) {
		return !(b.fixedHigh && a.fixedLow);
	}
	return false;
}

/** Which end of a route: where it leaves its source's Port, or where it enters its target's. */
type End = "first" | "last";

/**
 * A jog, where a stub carries straight on into a lane at a different height:
 * a short run across the stub's line, joining it to the lane.
 */
interface Jog {
	route: number;
	end: End;
	/** The Port's point, which names the Port that the jog's route shares with others. */
	port: Point;
	/** The stub's end, and a unit vector along the stub's line, out of its Node. */
	stub: Point;
	out: Point;
	/** How far the lane lies from the stub's line, toward higher coordinates or lower ones. */
	lane: number;
	/** How far past the stub's end the jog is, out along the stub's line. */
	along: number;
	/** How far past it the jog may go, leaving the lane some length before its next corner. */
	limit: number;
}

/** The jogs every route needs, keyed by route and end. */
function jogsOf(
	routes: NudgeRoute[],
	runs: Run[][],
	offsetOf: (run: Run) => number,
): Map<string, Jog> {
	const jogs = new Map<string, Jog>();
	routes.forEach((route, index) => {
		const routeRuns = runs[index] ?? [];
		for (const end of ["first", "last"] as const) {
			const run = end === "first" ? routeRuns[0] : routeRuns.at(-1);
			if (run === undefined || run.stubOnly || offsetOf(run) === 0) {
				continue;
			}
			const port = end === "first" ? route.fromPort : route.toPort;
			const out = headingOf(port.point, port.stub);
			// The lane reaches as far as the corner after it, which moves out by the
			// next run's lane. A route of one run shares its length between its jogs.
			const next = end === "first" ? routeRuns[1] : routeRuns.at(-2);
			const corner = end === "first" ? run.to : run.from;
			const reach =
				next === undefined || routeRuns.length === 1
					? along(port.stub, end === "first" ? route.toPort.stub : route.fromPort.stub, out) / 2
					: along(port.stub, corner, out) + offsetOf(next) * (next.horizontal ? out.y : out.x);
			jogs.set(`${index} ${end}`, {
				route: index,
				end,
				port: port.point,
				stub: port.stub,
				out,
				lane: offsetOf(run),
				along: 0,
				limit: reach,
			});
		}
	});
	return jogs;
}

/** How far `to` lies past `from`, along a unit vector. */
function along(from: Point, to: Point, direction: Point): number {
	return (to.x - from.x) * direction.x + (to.y - from.y) * direction.y;
}

/**
 * Places each jog along its stub's line, out from the stub's end. At one Port,
 * the jog to the farthest lane comes first, nearest the Port, and each jog
 * keeps beyond the routes that turn off the stub's line to the same side, so
 * that none of them cross. Each then moves out as far as it must to keep
 * clear of every other route's runs across the line.
 */
function placeJogs(
	jogs: Map<string, Jog>,
	routes: NudgeRoute[],
	runs: Run[][],
	offsetOf: (run: Run) => number,
	lanes: LaneSpacing,
): void {
	if (jogs.size === 0) {
		return;
	}
	// Every route's runs as drawn, leaving out the jogs, which move.
	const drawn = routes.map((route, index) =>
		segmentsOf(offsetRoute(route, runs[index] ?? [], offsetOf, () => 0)).filter(
			(segment) =>
				!isJog(segment, jogs.get(`${index} first`)) && !isJog(segment, jogs.get(`${index} last`)),
		),
	);
	const byPort = new Map<string, Jog[]>();
	for (const jog of jogs.values()) {
		const key = `${jog.end} ${jog.port.x} ${jog.port.y}`;
		byPort.set(key, [...(byPort.get(key) ?? []), jog]);
	}
	for (const portJogs of byPort.values()) {
		portJogs.sort((a, b) => Math.abs(b.lane) - Math.abs(a.lane) || a.route - b.route);
		const placed: Jog[] = [];
		// The routes of one lane group share a lane, so they share one jog too.
		const groupJogs = new Map<string, number>();
		for (const jog of portJogs) {
			const laneGroup = routes[jog.route]?.laneGroup ?? "";
			const key = `${laneGroup} ${jog.lane}`;
			const shared = groupJogs.get(key);
			if (shared !== undefined) {
				jog.along = shared;
				continue;
			}
			const others = (index: number) => routes[index]?.laneGroup !== laneGroup;
			const side = Math.sign(jog.lane);
			let start = 0;
			for (const other of placed.filter((candidate) => Math.sign(candidate.lane) === side)) {
				start = Math.max(start, other.along + lanes.minimum);
			}
			routes.forEach((route, index) => {
				const turn = turnOff(route, runs[index] ?? [], jog, offsetOf);
				if (others(index) && turn !== undefined && turn.side === side) {
					start = Math.max(start, turn.along + lanes.minimum);
				}
			});
			jog.along = start <= jog.limit ? start : 0;
			for (let at = jog.along; at <= jog.limit; at += lanes.minimum) {
				const segment = jogSegment(jog, at);
				const clear = drawn.every(
					(segments, index) =>
						!others(index) || segments.every((other) => !alongside(segment, other, lanes.minimum)),
				);
				if (clear) {
					jog.along = at;
					break;
				}
			}
			placed.push(jog);
			groupJogs.set(key, jog.along);
			drawn[jog.route]?.push(jogSegment(jog, jog.along));
		}
	}
}

/**
 * Where a route that shares a jog's Port turns off the stub's line, if it
 * does so right at the stub's end: how far out along the line, and to which
 * side of it.
 */
function turnOff(
	route: NudgeRoute,
	routeRuns: Run[],
	jog: Jog,
	offsetOf: (run: Run) => number,
): { along: number; side: number } | undefined {
	const port = jog.end === "first" ? route.fromPort : route.toPort;
	const stub = jog.end === "first" ? routeRuns[0] : routeRuns.at(-1);
	const turn = jog.end === "first" ? routeRuns[1] : routeRuns.at(-2);
	if (!same(port.point, jog.port) || stub?.stubOnly !== true || turn === undefined) {
		return undefined;
	}
	const away = jog.end === "first" ? turn.to : turn.from;
	const across = jog.out.x === 0 ? away.x - jog.stub.x : away.y - jog.stub.y;
	return {
		along: offsetOf(turn) * (turn.horizontal ? jog.out.y : jog.out.x),
		side: Math.sign(across),
	};
}

interface Segment {
	from: Point;
	to: Point;
}

function segmentsOf(points: Point[]): Segment[] {
	return points.slice(1).map((to, index) => ({ from: points[index] ?? to, to }));
}

/** The jog's run across the stub's line, placed `at` past the stub's end. */
function jogSegment(jog: Jog, at: number): Segment {
	const from = { x: jog.stub.x + jog.out.x * at, y: jog.stub.y + jog.out.y * at };
	const to =
		jog.out.x === 0 ? { x: from.x + jog.lane, y: from.y } : { x: from.x, y: from.y + jog.lane };
	return { from, to };
}

/** Whether a drawn segment is a jog's run at the stub's end. */
function isJog(segment: Segment, jog: Jog | undefined): boolean {
	if (jog === undefined) {
		return false;
	}
	const { from, to } = jogSegment(jog, 0);
	return (
		(same(segment.from, from) && same(segment.to, to)) ||
		(same(segment.from, to) && same(segment.to, from))
	);
}

/** Whether two segments run side by side, closer than `distance`, along a shared stretch. */
function alongside(a: Segment, b: Segment, distance: number): boolean {
	const vertical = (segment: Segment) => segment.from.x === segment.to.x;
	if (vertical(a) !== vertical(b)) {
		return false;
	}
	const [acrossA, acrossB] = vertical(a) ? [a.from.x, b.from.x] : [a.from.y, b.from.y];
	const span = (segment: Segment) =>
		vertical(segment) ? [segment.from.y, segment.to.y] : [segment.from.x, segment.to.x];
	const [a1 = 0, a2 = 0] = span(a);
	const [b1 = 0, b2 = 0] = span(b);
	const overlap =
		Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2));
	return Math.abs(acrossA - acrossB) < distance && overlap > 0;
}

/**
 * A route with every run offset by its lane. Where a stub carries straight on
 * into a lane at a different height, a short jog joins them, `jogAt` past the
 * stub's end.
 */
function offsetRoute(
	route: NudgeRoute,
	runs: Run[],
	offsetOf: (run: Run) => number,
	jogAt: (end: End) => number,
): Point[] {
	const shift = (point: Point, run: Run | undefined): Point => {
		if (run === undefined) {
			return point;
		}
		const offset = offsetOf(run);
		return run.horizontal
			? { x: point.x, y: point.y + offset }
			: { x: point.x + offset, y: point.y };
	};
	const outFrom = (port: ScenePort, end: End): Point => {
		const out = headingOf(port.point, port.stub);
		const at = jogAt(end);
		return { x: port.stub.x + out.x * at, y: port.stub.y + out.y * at };
	};
	const points: Point[] = [];
	const first = runs[0];
	const last = runs.at(-1);
	const start = route.points[0];
	if (start === undefined || first === undefined || last === undefined) {
		return route.points;
	}
	points.push(start);
	if (!first.stubOnly && offsetOf(first) !== 0) {
		const at = outFrom(route.fromPort, "first");
		points.push(at, shift(at, first));
	}
	for (let index = 1; index < runs.length; index += 1) {
		const corner = route.points[index] ?? start;
		points.push(shift(shift(corner, runs[index - 1]), runs[index]));
	}
	const end = route.points.at(-1) ?? start;
	if (!last.stubOnly && offsetOf(last) !== 0) {
		const at = outFrom(route.toPort, "last");
		points.push(shift(at, last), at);
	}
	points.push(end);
	return points;
}
