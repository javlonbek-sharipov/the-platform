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
	/** Whether it holds a first or last run that carries a stub straight on, so that it would rather not jog. */
	pinned: boolean;
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
	return routes.map((route, index) =>
		offsetRoute(route, runs[index] ?? [], (run) => offsets.get(run) ?? 0),
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
					pinned: false,
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
		stretch.pinned = stretch.runs.some((run) => carriesStub(run, routes));
	}
	return stretches;
}

/** Whether a run is a route's first or last, carrying its Port's stub straight on. */
function carriesStub(run: Run, routes: NudgeRoute[]): boolean {
	const route = routes[run.route];
	if (route === undefined) {
		return false;
	}
	return run.index === 0 || run.index === route.points.length - 2;
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
	const pinned = sorted.findIndex((stretch) => stretch.pinned);
	const wanted = pinned >= 0 ? line - pinned * gap : line - ((count - 1) * gap) / 2;
	const start = first <= last ? Math.min(Math.max(wanted, first), last) : wanted;
	sorted.forEach((stretch, index) => {
		stretch.offset = start + index * gap - line;
	});
}

/**
 * A route with every run offset by its lane. Where a stub carries straight on
 * into a lane at a different height, a short jog at the stub's end joins
 * them.
 */
function offsetRoute(route: NudgeRoute, runs: Run[], offsetOf: (run: Run) => number): Point[] {
	const shift = (point: Point, run: Run | undefined): Point => {
		if (run === undefined) {
			return point;
		}
		const offset = offsetOf(run);
		return run.horizontal
			? { x: point.x, y: point.y + offset }
			: { x: point.x + offset, y: point.y };
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
		points.push(route.fromPort.stub, shift(route.fromPort.stub, first));
	}
	for (let index = 1; index < runs.length; index += 1) {
		const corner = route.points[index] ?? start;
		points.push(shift(shift(corner, runs[index - 1]), runs[index]));
	}
	const end = route.points.at(-1) ?? start;
	if (!last.stubOnly && offsetOf(last) !== 0) {
		points.push(shift(route.toPort.stub, last), route.toPort.stub);
	}
	points.push(end);
	return points;
}
