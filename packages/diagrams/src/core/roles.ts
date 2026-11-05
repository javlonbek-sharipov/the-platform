/**
 * Role tags (spec: Static SVG, Look): each role that an end of an Edge
 * carries is drawn as a short tag at that end. A tag sits on its Edge's line,
 * which runs through it, so that it's plain which Edge it belongs to, on a
 * stretch that's the Edge's own: past its Port's stub, where the Edges that
 * share the Port have parted, and not along another route.
 *
 * The tags of an Edge's `from` end come first along its route, as near its
 * source as they have room, in the model's order. Those of its `to` end come
 * last, as near its target as they have room. Each tag stays nearer its own
 * end than the other one, and keeps clear of Nodes, callouts' tags, Group
 * labels and the tags placed before it. Where it can, without going far from
 * its end, it also covers no other route and no Group's border, so that it
 * hides nothing: where two Edges run side by side, each one's tag keeps to
 * the outer side of its own line. Labels come after the tags, and keep clear
 * of them.
 *
 * A tag that has no such room is drawn just past its Port's stub anyway, with
 * a warning.
 */

import type { AnyEdge } from "../authoring/model.ts";
import { compareText } from "./bundles.ts";
import type { Diagnostic } from "./diagnostics.ts";
import {
	crosses,
	grown,
	headingOf,
	type LineSpan,
	overlaps,
	type Segment,
	sidesOf,
} from "./geometry.ts";
import { ownStretchesByRun, runsOf } from "./labels.ts";
import type {
	Box,
	Point,
	RoutePoint,
	SceneEdge,
	SceneGroup,
	SceneNode,
	ScenePort,
	SceneRole,
} from "./scene.ts";
import { roleTagSize, roleText } from "./text.ts";

/**
 * How role tags keep clear: the gap between two tags, the margin a tag keeps
 * from Nodes, callouts' tags and Group labels, and from each end of the
 * stretch it sits on, and the stretch of bare line that layout leaves between
 * the tags of an Edge's two ends, so that its line, and a chevron on it, show
 * between them.
 */
export const roleSpacing = { gap: 2, margin: 4, between: 24 };

/** How far apart the places are that a tag tries along a stretch. */
const step = 1;

/**
 * A tag sits centered on its line, or to one side of it, with its edge this
 * far past the line, so that the line still runs through it. So where two
 * Edges run side by side, each one's tag can keep to the outer side of its
 * own line, off the other.
 */
const hold = 4;

/** A tag hides a route that passes through it, or nearer it than this. */
const halo = 2;

/**
 * How far past the nearest place with room for it a tag may go so as to
 * hide nothing. Rather than go further from its end, it covers what it must.
 */
const near = 128;

type Size = { width: number; height: number };

/**
 * The room that an end's role tags take along its Edge's line: side by side
 * along a horizontal run, or one after another along a vertical one.
 */
export function rolesExtent(roles: readonly string[], horizontal: boolean): number {
	const sizes = roles.map((role) => roleTagSize(role)[horizontal ? "width" : "height"]);
	return (
		sizes.reduce((sum, size) => sum + size, 0) + roleSpacing.gap * Math.max(0, roles.length - 1)
	);
}

export interface RolePlacement {
	/** Each Edge's role tags, by the Edge's id: its `from` end's, then its `to` end's. */
	roles: Map<string, SceneRole[]>;
	/**
	 * The stretches of its line that each Edge's tags take, by the Edge's id,
	 * with their margin, which the Edge's label leaves to them.
	 */
	taken: Map<string, LineSpan[]>;
	/** A warning for each tag that had no room. */
	diagnostics: Diagnostic[];
}

/** A run of a route, from corner to corner, with how far along the route it starts. */
interface Run {
	from: Point;
	heading: Point;
	horizontal: boolean;
	start: number;
	length: number;
}

/** A stretch of one run that's its Edge's own, by how far along the route it starts and ends. */
interface Room {
	run: Run;
	start: number;
	end: number;
}

/**
 * A place for a tag: its run, how far along the route its middle lies, which
 * side of its line it keeps to, if it isn't centered on it, and its box.
 */
interface Spot {
	run: Run;
	at: number;
	side: -1 | 0 | 1;
	box: Box;
}

/**
 * Where along its route a tag may go: no part of it before `low` or past
 * `high`, and its middle on its own end's side of `middle`.
 */
interface Bounds {
	low: number;
	high: number;
	middle: number;
}

/** Places the role tags of every Edge that carries roles, in the order of the Edges' ids. */
export function placeRoles(
	diagram: { edges: AnyEdge[] },
	nodes: SceneNode[],
	groups: SceneGroup[],
	edges: SceneEdge[],
): RolePlacement {
	const byId = new Map(edges.map((edge) => [edge.id, edge]));
	const spans = new Map(edges.map((edge) => [edge.id, runsOf(edge.route, false)]));
	// Tags stay clear of these, and of each other.
	const solid: Box[] = [
		...nodes.flatMap(({ box, callout }) => (callout === undefined ? [box] : [box, callout.tag])),
		...groups.map(({ label }) => label),
	].map((box) => grown(box, roleSpacing.margin));
	const borders = groups.map(({ box }) => box);
	const borderSides = borders.flatMap(sidesOf);
	const placed: Box[] = [];
	const covers = (box: Box) =>
		solid.some((other) => overlaps(box, other)) ||
		placed.some((other) => overlaps(grown(box, roleSpacing.gap), other));

	const roles = new Map<string, SceneRole[]>();
	const taken = new Map<string, LineSpan[]>();
	const warnings: { index: number; diagnostic: Diagnostic }[] = [];
	const wanted = diagram.edges
		.flatMap((edge, index) => {
			const scene = byId.get(edge.id);
			const [from, to] = [edge.roles?.from ?? [], edge.roles?.to ?? []];
			return scene === undefined || from.length + to.length === 0
				? []
				: [{ edge, index, scene, from, to }];
		})
		.sort((a, b) => compareText(a.edge.id, b.edge.id));
	for (const { edge, index, scene, from, to } of wanted) {
		const others = edges.filter((other) => other !== scene);
		const runs = runsAlong(scene.route);
		const length = runs.reduce((sum, run) => sum + run.length, 0);
		const rooms = roomsOf(
			scene,
			runs,
			others.flatMap((other) => spans.get(other.id) ?? []),
			borders,
		);
		// Where it can, a tag covers no other route and no Group's border.
		const lines: Segment[] = [
			...others.flatMap(({ route }) =>
				route.slice(1).map((point, at): Segment => [route[at] ?? point, point]),
			),
			...borderSides,
		];
		const hides = (box: Box) => lines.some(([a, b]) => crosses(grown(box, halo), a, b));
		/**
		 * One end's tags, walking away from that end: each as near it as it has
		 * room, beyond the tag before it. First where it hides nothing, on its
		 * line or to one side of it, as long as that's near. Then wherever it's
		 * clear of the rest.
		 */
		const tagsAt = (end: "from" | "to", listed: readonly string[], bounds: Bounds) => {
			const way = end === "from" ? 1 : -1;
			let { low, high } = bounds;
			// An end's tags keep to one side of their line together, where they can.
			let side: Spot["side"] = 0;
			return listed.map((role, place): { tag: SceneRole; spot: Spot } => {
				const size = roleTagSize(role);
				const within = { ...bounds, low, high };
				let spot =
					firstSpot(rooms, size, way, within, (box) => !covers(box) && !hides(box), {
						reach: near,
						side,
					}) ?? firstSpot(rooms, size, way, within, (box) => !covers(box));
				if (spot === undefined) {
					spot = pastStub(runs, end === "from" ? scene.fromPort : scene.toPort, size, way, within);
					warnings.push({
						index,
						diagnostic: {
							severity: "warning",
							rule: "role-placement",
							message: `Edge \`${edge.id}\`'s role \`${role}\` has no room on the Edge's own line near its \`${end}\` end, clear of Nodes, Group labels and other role tags, so its tag is drawn just past its Port's stub.`,
							pointer: `/edges/${index}/roles/${end}/${end === "from" ? place : listed.length - 1 - place}`,
						},
					});
				}
				placed.push(spot.box);
				side = spot.side;
				const reach = alongOf(spot.run, size) / 2 + roleSpacing.gap;
				if (way > 0) {
					low = spot.at + reach;
				} else {
					high = spot.at - reach;
				}
				return { tag: { end, role, tag: spot.box, text: roleText(role, spot.box) }, spot };
			});
		};
		// The `from` end's tags, from the source on, in the model's order. Then
		// the `to` end's, back from the target, the last of them first, short of
		// the `from` end's.
		const first = tagsAt("from", from, { low: 0, high: length, middle: length / 2 });
		const reached = Math.max(
			0,
			...first.map(({ spot, tag }) => spot.at + alongOf(spot.run, tag.tag) / 2),
		);
		const last = tagsAt("to", [...to].reverse(), {
			low: reached,
			high: length,
			middle: length / 2,
		});
		const all = [...first, ...last.reverse()];
		roles.set(
			edge.id,
			all.map(({ tag }) => tag),
		);
		taken.set(
			edge.id,
			all.map(({ spot }) => spanOf(spot)),
		);
	}
	return {
		roles,
		taken,
		diagnostics: warnings.sort((a, b) => a.index - b.index).map(({ diagnostic }) => diagnostic),
	};
}

/** A route's runs, from corner to corner, each with how far along the route it starts. */
function runsAlong(route: RoutePoint[]): Run[] {
	let start = 0;
	return route.slice(1).map((to, index) => {
		const from = route[index] ?? to;
		const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
		const run = { from, heading: headingOf(from, to), horizontal: from.y === to.y, start, length };
		start += length;
		return run;
	});
}

/**
 * The stretches of an Edge's route that are its own, in the order of the
 * route, each by how far along the route it starts and ends.
 */
function roomsOf(edge: SceneEdge, runs: Run[], others: LineSpan[], borders: Box[]): Room[] {
	return ownStretchesByRun(edge, others, borders).flatMap((stretches, index) => {
		const run = runs[index];
		if (run === undefined) {
			return [];
		}
		const origin = run.horizontal ? run.from.x : run.from.y;
		const way = run.horizontal ? run.heading.x : run.heading.y;
		return stretches
			.map(({ low, high }): Room => {
				const [a, b] = [run.start + (low - origin) * way, run.start + (high - origin) * way];
				return { run, start: Math.min(a, b), end: Math.max(a, b) };
			})
			.sort((a, b) => a.start - b.start);
	});
}

/** How much of its run's length a tag takes: its width along a horizontal run, and its height along a vertical one. */
function alongOf(run: Run, size: Size): number {
	return run.horizontal ? size.width : size.height;
}

/**
 * A tag's box, at the point of a run that lies `at` along the route: centered
 * on it, or moved `aside` across the run.
 */
function boxAt(run: Run, at: number, size: Size, aside = 0): Box {
	const along = at - run.start;
	return {
		x: run.from.x + run.heading.x * along - size.width / 2 + (run.horizontal ? 0 : aside),
		y: run.from.y + run.heading.y * along - size.height / 2 + (run.horizontal ? aside : 0),
		...size,
	};
}

/**
 * The first place for a tag that `clear` accepts, walking the route's own
 * stretches from its source (`way` 1) or back from its target (`way` -1),
 * within its bounds.
 *
 * Given `sides`, the tag may also sit to either side of its line: first the
 * side that the tag before it keeps to, if any, then centered on the line,
 * then the other side. And the walk then goes no further than `reach` past
 * the first place it tried.
 */
function firstSpot(
	rooms: Room[],
	size: Size,
	way: 1 | -1,
	bounds: Bounds,
	clear: (box: Box) => boolean,
	sides?: { reach: number; side: Spot["side"] },
): Spot | undefined {
	const tried: Spot["side"][] =
		sides === undefined
			? [0]
			: sides.side === 0
				? [0, -1, 1]
				: [sides.side, 0, sides.side > 0 ? -1 : 1];
	let nearest: number | undefined;
	for (const room of way > 0 ? rooms : [...rooms].reverse()) {
		const half = alongOf(room.run, size) / 2;
		const first = Math.max(room.start + roleSpacing.margin, bounds.low) + half;
		const last = Math.min(room.end - roleSpacing.margin, bounds.high) - half;
		// To one side, the tag's edge stays past its line, so the line runs through it.
		const aside = (room.run.horizontal ? size.height : size.width) / 2 - hold;
		for (let at = way > 0 ? first : last; at >= first && at <= last; at += way * step) {
			nearest ??= at;
			// Past the route's middle, a tag would sit nearer the other end.
			if (
				(way > 0 ? at >= bounds.middle : at <= bounds.middle) ||
				(sides !== undefined && Math.abs(at - nearest) > sides.reach)
			) {
				return undefined;
			}
			for (const side of tried) {
				const box = boxAt(room.run, at, size, side * aside);
				if (clear(box)) {
					return { run: room.run, at, side, box };
				}
			}
		}
	}
	return undefined;
}

/**
 * Where a tag goes when nothing has room for it: just past its Port's stub,
 * or beyond the tag before it, whatever lies there.
 */
function pastStub(runs: Run[], port: ScenePort, size: Size, way: 1 | -1, bounds: Bounds): Spot {
	const length = runs.reduce((sum, run) => sum + run.length, 0);
	const stub = Math.abs(port.stub.x - port.point.x) + Math.abs(port.stub.y - port.point.y);
	const nearest = (way > 0 ? runs[0] : runs.at(-1)) ?? {
		from: port.point,
		heading: { x: 1, y: 0 },
		horizontal: true,
		start: 0,
		length: 0,
	};
	const past = Math.min(stub, nearest.length) + roleSpacing.margin;
	const half = alongOf(nearest, size) / 2;
	const at =
		way > 0
			? Math.min(Math.max(bounds.low, past) + half, length)
			: Math.max(Math.min(bounds.high, length - past) - half, 0);
	// The run that the place lies on, which is the nearest one unless tags before it fill that.
	const run = runs.find((candidate) => at <= candidate.start + candidate.length) ?? nearest;
	return { run, at, side: 0, box: boxAt(run, at, size) };
}

/** The stretch of its run's line that a tag takes, with its margin at each end. */
function spanOf({ run, box }: Spot): LineSpan {
	const [low, size] = run.horizontal ? [box.x, box.width] : [box.y, box.height];
	return {
		horizontal: run.horizontal,
		line: run.horizontal ? run.from.y : run.from.x,
		low: low - roleSpacing.margin,
		high: low + size + roleSpacing.margin,
	};
}
