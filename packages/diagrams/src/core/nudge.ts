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
 * keeps to the outer side of it, so that the stub stays whole. A first or
 * last run that carries on straight past the stub keeps the stub's line where
 * it can, and otherwise jogs to its lane at the stub's end.
 */

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
	group: string;
}

export interface Corridors {
	/** What no lane may come near: Nodes, callouts' tags and Group labels. */
	obstacles: Box[];
	/** Group boxes, whose borders lanes keep clear of too. */
	borders: Box[];
}

export interface LaneSpacing {
	/** How far apart neighboring lanes are, where there's room. */
	preferred: number;
	/** How far apart they stay in a narrow corridor. */
	minimum: number;
	/** How far every lane stays from the corridor's sides. */
	padding: number;
}

/** A run of a route: a straight stretch from one corner to the next. */
interface Run {
	route: number;
	index: number;
	horizontal: boolean;
	/** The coordinate of its line: y for a horizontal run, x for a vertical one. */
	line: number;
	from: Point;
	to: Point;
	low: number;
	high: number;
	/** Whether it's only a Port's stub: a first run that turns at the stub's end, or the like last run. */
	stubOnly: boolean;
}

/** The stretch of one line that one lane group uses, which takes one lane. */
interface Stretch {
	horizontal: boolean;
	line: number;
	low: number;
	high: number;
	group: string;
	runs: Run[];
	/**
	 * How much it would rather keep its line: 2 when it holds a route that runs
	 * straight from stub to stub, which would jog at both ends, 1 when it holds
	 * a first or last run that carries a stub straight on, and 0 otherwise.
	 */
	pinned: number;
	/** Whether its corners at its low and high ends stay put, being where it leaves a stub. */
	fixedLow: boolean;
	fixedHigh: boolean;
	/** Where its lane may go, across the line. */
	lowest: number;
	highest: number;
	offset: number;
}

export function nudge(routes: NudgeRoute[], corridors: Corridors, spacing: LaneSpacing): Point[][] {
	const runs = routes.map(runsOf);
	const stretches = stretchesOf(runs.flat(), routes);
	for (const stretch of stretches) {
		limit(stretch, stretches, runs, routes, corridors, spacing);
	}
	for (const set of overlapSets(stretches)) {
		const sorted = sortSet(set, runs);
		place(sorted, spacing);
	}
	const offsets = new Map<Run, number>();
	for (const stretch of stretches) {
		for (const run of stretch.runs) {
			offsets.set(run, stretch.offset);
		}
	}
	const offsetOf = (run: Run) => offsets.get(run) ?? 0;
	const jogs = jogsOf(routes, runs, offsetOf);
	placeJogs(jogs, routes, runs, offsetOf, spacing);
	return routes.map((route, index) =>
		offsetRoute(
			route,
			runs[index] ?? [],
			offsetOf,
			(end) => jogs.get(`${index} ${end}`)?.along ?? 0,
		),
	);
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
			const group = routes[run.route]?.group ?? "";
			byGroup.set(group, [...(byGroup.get(group) ?? []), run]);
		}
		for (const [group, groupRuns] of byGroup) {
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
					group,
					runs: [run],
					pinned: 0,
					fixedLow: false,
					fixedHigh: false,
					lowest: run.line,
					highest: run.line,
					offset: 0,
				};
				stretches.push(current);
			}
		}
	}
	for (const stretch of stretches) {
		stretch.pinned = Math.max(0, ...stretch.runs.map((run) => stubsCarried(run, routes)));
	}
	return stretches;
}

/** How many of its Ports' stubs a run carries straight on: as a route's first run, its last, or both. */
function stubsCarried(run: Run, routes: NudgeRoute[]): number {
	const last = (routes[run.route]?.points.length ?? 0) - 2;
	return (run.index === 0 ? 1 : 0) + (run.index === last ? 1 : 0);
}

/**
 * Where a stretch's lane may go across its line: clear of every obstacle and
 * Group border beside it, by the padding, and on its own side of the middle
 * between its line and any other line whose stretches run beside it. A
 * stretch that turns away from a stub's end keeps to the stub's outer side.
 */
function limit(
	stretch: Stretch,
	stretches: Stretch[],
	runs: Run[][],
	routes: NudgeRoute[],
	corridors: Corridors,
	spacing: LaneSpacing,
): void {
	const { horizontal, line, low, high } = stretch;
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
				below = Math.max(below, far + spacing.padding);
			} else if (near >= line) {
				above = Math.min(above, near - spacing.padding);
			}
		}
	}
	for (const box of corridors.borders) {
		const [start = 0, end = 0] = along(box);
		if (start < high && end > low) {
			for (const side of across(box)) {
				if (side < line) {
					below = Math.max(below, side + spacing.padding);
				} else if (side > line) {
					above = Math.min(above, side - spacing.padding);
				}
			}
		}
	}
	for (const other of stretches) {
		if (
			other.horizontal === horizontal &&
			other.line !== line &&
			other.group !== stretch.group &&
			other.low <= high &&
			other.high >= low
		) {
			const middle = (line + other.line) / 2;
			if (other.line < line) {
				below = Math.max(below, middle + spacing.minimum / 2);
			} else {
				above = Math.min(above, middle - spacing.minimum / 2);
			}
		}
	}
	for (const run of stretch.runs) {
		const outward = stubSide(run, runs[run.route] ?? [], routes[run.route]);
		if (outward > 0) {
			below = Math.max(below, line);
		} else if (outward < 0) {
			above = Math.min(above, line);
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

/**
 * For a run that turns away from the end of a stub on its own, which way
 * along the stub its lane must keep, so that the stub stays whole: 1 toward
 * higher coordinates, -1 toward lower ones, or 0 when it doesn't touch a stub.
 */
function stubSide(run: Run, routeRuns: Run[], route: NudgeRoute | undefined): number {
	if (route === undefined) {
		return 0;
	}
	const before = routeRuns[run.index - 1];
	const after = routeRuns[run.index + 1];
	if (before?.stubOnly === true && before.index === 0) {
		const { point, stub } = route.fromPort;
		return Math.sign(run.horizontal ? stub.y - point.y : stub.x - point.x);
	}
	if (after?.stubOnly === true) {
		const { point, stub } = route.toPort;
		return Math.sign(run.horizontal ? stub.y - point.y : stub.x - point.x);
	}
	return 0;
}

/** Whether a run meets a stub on its own at the given end, where its corner can't move along it. */
function leavesStubAt(run: Run, end: number, routeRuns: Run[]): boolean {
	const before = routeRuns[run.index - 1];
	const after = routeRuns[run.index + 1];
	const start = run.horizontal ? run.from.x : run.from.y;
	return start === end ? before?.stubOnly === true : after?.stubOnly === true;
}

/**
 * The overlap sets on each line: stretches whose spans overlap, or meet at a
 * point where either one's corner can move, together with every stretch that
 * overlaps those.
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
		let set: Stretch[] = [];
		let reach = Number.NEGATIVE_INFINITY;
		let fixedAtReach = false;
		for (const stretch of lineStretches) {
			const joins =
				set.length > 0 &&
				(stretch.low < reach || (stretch.low === reach && !(fixedAtReach && stretch.fixedLow)));
			if (!joins) {
				if (set.length > 0) {
					sets.push(set);
				}
				set = [];
				reach = Number.NEGATIVE_INFINITY;
			}
			set.push(stretch);
			if (stretch.high > reach) {
				reach = stretch.high;
				fixedAtReach = stretch.fixedHigh;
			} else if (stretch.high === reach) {
				fixedAtReach = fixedAtReach && stretch.fixedHigh;
			}
		}
		if (set.length > 0) {
			sets.push(set);
		}
	}
	return sets;
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
	const heading = headingOf(runA, 1);
	return (a.group < b.group ? 1 : -1) * leftward(runA.horizontal, heading);
}

/** A unit vector along a run, the way the route travels, or the other way for `step` -1. */
function headingOf(run: Run, step: number): Point {
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
		const heading = headingOf(a, step);
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
	const headingA = headingOf(a, step);
	const sameWay = (() => {
		const headingB = headingOf(b, 1);
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
		const heading = headingOf(runA, step);
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
	const turned = headingOf(next, step);
	// With y pointing down, left of heading (x, y) is (y, -x).
	return turned.x === heading.y && turned.y === -heading.x ? 1 : -1;
}

/**
 * Spaces a sorted overlap set evenly, at the preferred spacing where its
 * stretches' limits allow, squeezed to fit where they don't. The set is
 * centered on its line, or keeps a stretch that carries a stub on the line,
 * so that it needn't jog.
 */
function place(sorted: Stretch[], spacing: LaneSpacing): void {
	const count = sorted.length;
	const line = sorted[0]?.line ?? 0;
	let room = Number.POSITIVE_INFINITY;
	for (let i = 0; i < count; i += 1) {
		for (let j = i + 1; j < count; j += 1) {
			const lowest = sorted[i]?.lowest ?? line;
			const highest = sorted[j]?.highest ?? line;
			room = Math.min(room, (highest - lowest) / (j - i));
		}
	}
	let gap = Math.min(spacing.preferred, room);
	if (!(gap > 0)) {
		gap = spacing.minimum;
	}
	let first = Number.NEGATIVE_INFINITY;
	let last = Number.POSITIVE_INFINITY;
	sorted.forEach((stretch, index) => {
		first = Math.max(first, stretch.lowest - index * gap);
		last = Math.min(last, stretch.highest - index * gap);
	});
	const most = Math.max(...sorted.map((stretch) => stretch.pinned));
	const pinned = most > 0 ? sorted.findIndex((stretch) => stretch.pinned === most) : -1;
	const wanted = pinned >= 0 ? line - pinned * gap : line - ((count - 1) * gap) / 2;
	const start = first <= last ? Math.min(Math.max(wanted, first), last) : wanted;
	sorted.forEach((stretch, index) => {
		stretch.offset = start + index * gap - line;
	});
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
			const out = unit(port.point, port.stub);
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

function unit(from: Point, to: Point): Point {
	return { x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y) };
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
	spacing: LaneSpacing,
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
		for (const jog of portJogs) {
			const side = Math.sign(jog.lane);
			let start = 0;
			for (const other of placed.filter((candidate) => Math.sign(candidate.lane) === side)) {
				start = Math.max(start, other.along + spacing.minimum);
			}
			routes.forEach((route, index) => {
				const turn = turnOff(route, runs[index] ?? [], jog, offsetOf);
				if (turn !== undefined && turn.side === side) {
					start = Math.max(start, turn.along + spacing.minimum);
				}
			});
			jog.along = start <= jog.limit ? start : 0;
			for (let at = jog.along; at <= jog.limit; at += spacing.minimum) {
				const segment = jogSegment(jog, at);
				const clear = drawn.every(
					(segments, index) =>
						index === jog.route ||
						segments.every((other) => !alongside(segment, other, spacing.minimum)),
				);
				if (clear) {
					jog.along = at;
					break;
				}
			}
			placed.push(jog);
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
		const out = unit(port.point, port.stub);
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
