/**
 * Crossings (spec: Edge routing, step 9). Where Edges with different targets
 * cross at a right angle, one of them hops: its stroke breaks with a short
 * gap, centered on the crossing, so that readers see the two don't connect.
 * Edges that go into one Port meet there anyway, so they never hop over each
 * other. Where routes cross at a corner's arc, they don't cross at a right
 * angle, and nothing hops.
 *
 * A fixed rule decides which Edges hop, once for each point where routes
 * cross: those that run across the direction there, vertical for `right` and
 * horizontal for `down`, so that the runs along the direction stay whole.
 * But if one of those runs hasn't room for the gap there, short of a corner's
 * arc, and every Edge that runs along the direction there has, those hop
 * instead. When neither side has room for all of it, the side with more room
 * hops, with its gap cut short at the arc. A crossing at the very start of
 * both routes' arcs, where both begin to curve, gets no hop.
 *
 * Each Edge's stroke is then its route in pieces, from gap to gap. Gaps that
 * would leave only a sliver of stroke between them join into one.
 */

import type { Direction } from "../authoring/model.ts";
import type { LineSpan } from "./geometry.ts";
import type { Point, RoutePoint, SceneEdge } from "./scene.ts";

/** The length of the gap a hop leaves in a stroke, centered on the crossing. */
export const hop = 8;

/** Two gaps closer than this join into one, rather than leave a sliver of stroke between them. */
const sliver = 4;

/**
 * A run of a route, and the part of it that's straight, between the arcs that
 * round its corners, from `low` to `high` along its line.
 */
interface Run extends LineSpan {
	/** Which run of the route it is: the one from its point `index` to the next. */
	index: number;
}

/** Each Edge's stroke, in the order of the Edges given: its route, in pieces between hops. */
export function strokesOf(edges: SceneEdge[], direction: Direction): RoutePoint[][][] {
	const runs = edges.map(({ route }) => straightRuns(route));
	const targets = edges.map(({ to, toRow }) => JSON.stringify([to, toRow ?? null]));
	// Each point where Edges with different targets cross, with the runs of the
	// Edges through it, by the Edges' indices.
	const points = new Map<
		string,
		{ point: Point; horizontal: Map<number, Run>; vertical: Map<number, Run> }
	>();
	edges.forEach((_, a) => {
		for (let b = a + 1; b < edges.length; b += 1) {
			if (targets[a] === targets[b]) {
				continue;
			}
			for (const first of runs[a] ?? []) {
				for (const second of runs[b] ?? []) {
					if (first.horizontal === second.horizontal) {
						continue;
					}
					const [horizontal, vertical, horizontalEdge, verticalEdge] = first.horizontal
						? [first, second, a, b]
						: [second, first, b, a];
					const point = { x: vertical.line, y: horizontal.line };
					if (
						crossesAt(horizontal, point) &&
						crossesAt(vertical, point) &&
						Math.max(roomAt(horizontal, point), roomAt(vertical, point)) > 0
					) {
						const key = `${point.x} ${point.y}`;
						const entry = points.get(key) ?? { point, horizontal: new Map(), vertical: new Map() };
						entry.horizontal.set(horizontalEdge, horizontal);
						entry.vertical.set(verticalEdge, vertical);
						points.set(key, entry);
					}
				}
			}
		}
	});

	// For each Edge, and each run of its route, the gaps it hops by, and the
	// points where it must stay whole.
	const gaps = edges.map(({ route }) => route.slice(1).map((): [number, number][] => []));
	const whole = edges.map(({ route }) => route.slice(1).map((): number[] => []));
	for (const { point, horizontal, vertical } of points.values()) {
		const [across, along] = direction === "right" ? [vertical, horizontal] : [horizontal, vertical];
		const room = (crossing: Map<number, Run>) =>
			Math.min(...[...crossing.values()].map((run) => roomAt(run, point)));
		const [acrossRoom, alongRoom] = [room(across), room(along)];
		const acrossHops = acrossRoom >= hop / 2 || (alongRoom < hop / 2 && acrossRoom >= alongRoom);
		if ((acrossHops ? acrossRoom : alongRoom) === 0) {
			// Both routes start to curve here, so neither crosses the other at a right angle.
			continue;
		}
		const [hopping, staying] = acrossHops ? [across, along] : [along, across];
		for (const [edge, run] of hopping) {
			const middle = run.horizontal ? point.x : point.y;
			gaps[edge]?.[run.index]?.push([
				Math.max(run.low, middle - hop / 2),
				Math.min(run.high, middle + hop / 2),
			]);
		}
		for (const [edge, run] of staying) {
			whole[edge]?.[run.index]?.push(run.horizontal ? point.x : point.y);
		}
	}
	return edges.map(({ route }, edge) =>
		piecesOf(
			route,
			route.slice(1).map((_, run) => joined(gaps[edge]?.[run] ?? [], whole[edge]?.[run] ?? [])),
		),
	);
}

/** Whether a point on a run's line lies on its straight part, ends included. */
function crossesAt(run: Run, point: Point): boolean {
	const middle = run.horizontal ? point.x : point.y;
	return run.low <= middle && middle <= run.high;
}

/** How far a point on a run lies from the nearer end of the run's straight part. */
function roomAt(run: Run, point: Point): number {
	const middle = run.horizontal ? point.x : point.y;
	return Math.min(middle - run.low, run.high - middle);
}

/**
 * The gaps of one run, in order along it, with each two that would leave a
 * sliver of stroke between them joined into one, unless the sliver holds a
 * point where the Edge must stay whole.
 */
function joined(gaps: [number, number][], whole: number[]): [number, number][] {
	const sorted = [...gaps].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const result: [number, number][] = [];
	for (const [low, high] of sorted) {
		const last = result.at(-1);
		if (
			last !== undefined &&
			low - last[1] < sliver &&
			!whole.some((point) => last[1] <= point && point <= low)
		) {
			last[1] = Math.max(last[1], high);
		} else {
			result.push([low, high]);
		}
	}
	return result;
}

/** The runs of a route, each with its straight part, between the arcs that round its corners. */
function straightRuns(route: RoutePoint[]): Run[] {
	return route.slice(1).flatMap((to, index): Run[] => {
		const from = route[index];
		if (from === undefined) {
			return [];
		}
		const horizontal = from.y === to.y;
		const [lowEnd, highEnd] = (horizontal ? from.x < to.x : from.y < to.y)
			? [from, to]
			: [to, from];
		return [
			{
				index,
				horizontal,
				line: horizontal ? from.y : from.x,
				low: (horizontal ? lowEnd.x : lowEnd.y) + lowEnd.radius,
				high: (horizontal ? highEnd.x : highEnd.y) - highEnd.radius,
			},
		];
	});
}

/**
 * A route in pieces: it breaks at each gap of each run, in the order the
 * route runs. Where a piece ends or starts at a gap, its point is sharp.
 */
function piecesOf(route: RoutePoint[], gaps: [number, number][][]): RoutePoint[][] {
	const first = route[0];
	if (first === undefined) {
		return [];
	}
	const pieces: RoutePoint[][] = [];
	let piece: RoutePoint[] = [first];
	route.slice(1).forEach((to, index) => {
		const from = route[index] ?? to;
		const horizontal = from.y === to.y;
		const forward = horizontal ? to.x > from.x : to.y > from.y;
		const along = (value: number): RoutePoint =>
			horizontal ? { x: value, y: from.y, radius: 0 } : { x: from.x, y: value, radius: 0 };
		const ordered = forward
			? (gaps[index] ?? [])
			: [...(gaps[index] ?? [])].reverse().map(([low, high]): [number, number] => [high, low]);
		for (const [enter, leave] of ordered) {
			piece.push(along(enter));
			pieces.push(piece);
			piece = [along(leave)];
		}
		piece.push(to);
	});
	pieces.push(piece);
	return pieces;
}
