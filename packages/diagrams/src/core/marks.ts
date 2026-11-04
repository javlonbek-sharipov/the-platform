/**
 * The marks along each routed Edge (spec: Static SVG, Look): the chevrons
 * that show which way it runs, the junctions where Edges that leave one Port
 * part, and the badge of an Edge that crosses between regions or zones.
 * They're plain geometry in the scene, so that any renderer draws them alike.
 *
 * Every distance here is measured along a route's runs, from corner point to
 * corner point, ignoring the arcs that round the corners.
 */

import type { Diagram } from "../authoring/model.ts";
import type { Point, RoutePoint, SceneChevron, SceneEdge, SceneJunction } from "./scene.ts";

/** An Edge as the router leaves it, before its marks are added. */
export type RoutedEdge = Omit<SceneEdge, "chevrons" | "crosses">;

/**
 * Chevrons sit at this spacing back from the target, the first of them this
 * far from it, which is the middle of an Edge between neighboring ranks.
 */
const chevronSpacing = 128;
const firstChevron = 48;
/**
 * How far a chevron's middle keeps from a corner's arc: half its length
 * along its run, and some clearance.
 */
const chevronRoom = 2 + 4;
/**
 * How far an Edge's chevrons keep from where it leaves the Edges that share
 * its source's Port, and from where it joins the Edges that share its
 * target's. Its arrowhead takes the end of its target's stub.
 */
const sharedClearance = 8;
const arrowRoom = 16;

/** Which Edges share a Port, by the point where it sits on its Node. */
function byPort(edges: RoutedEdge[], end: "fromPort" | "toPort"): Map<string, RoutedEdge[]> {
	const found = new Map<string, RoutedEdge[]>();
	for (const edge of edges) {
		const key = pointKey(edge[end].point);
		found.set(key, [...(found.get(key) ?? []), edge]);
	}
	return found;
}

export function markEdges(diagram: Diagram, edges: RoutedEdge[]): SceneEdge[] {
	const fromPort = byPort(edges, "fromPort");
	const toPort = byPort(edges, "toPort");
	const clear = clearOfCorners(edges);
	const crossing = crossingOf(diagram);
	return edges.map((edge) => {
		const others = (sharing: Map<string, RoutedEdge[]>, end: "fromPort" | "toPort") =>
			(sharing.get(pointKey(edge[end].point)) ?? []).filter((other) => other !== edge);
		// The stretch out of the source's Port that the Edge shares with the other
		// Edges from it, at least its stub, and the stretch into the target's Port
		// that it shares with the other Edges into it, such as a bundle's trunk.
		// Between them lies the stretch that's the Edge's own.
		const sharedOut = Math.max(
			lengthOf([edge.fromPort.point, edge.fromPort.stub]),
			...others(fromPort, "fromPort").map((other) => parting(edge.route, other.route).length),
		);
		const sharedIn = Math.max(
			lengthOf([edge.toPort.point, edge.toPort.stub]),
			...others(toPort, "toPort").map(
				(other) => parting([...edge.route].reverse(), [...other.route].reverse()).length,
			),
		);
		const fromSource = sharedOut + sharedClearance;
		const intoTarget = Math.max(arrowRoom, sharedIn + sharedClearance);
		const chevrons = chevronsOf(edge.route, fromSource, clear);
		const kind = crossing(edge.from, edge.to);
		return {
			...edge,
			chevrons:
				chevrons.length > 0 ? chevrons : middleChevron(edge.route, fromSource, intoTarget, clear),
			...(kind === undefined
				? {}
				: { crosses: { kind, badge: ownMiddle(edge.route, sharedOut, sharedIn) } }),
		};
	});
}

/**
 * Which Groups an Edge between two Nodes crosses between: regions, when its
 * ends sit in different `region` Groups, or else zones, when they sit in
 * different `zone` Groups. Each end counts the innermost Group of each Kind
 * around it, and an end in no Group of a Kind crosses nothing of that Kind.
 */
function crossingOf(diagram: Diagram): (from: string, to: string) => "region" | "zone" | undefined {
	const parentOf = new Map<string, string>();
	for (const group of diagram.groups) {
		for (const member of group.members) {
			parentOf.set(member, group.id);
		}
	}
	const kindOf = new Map(diagram.groups.map((group) => [group.id, group.kind as string]));
	/** The innermost Group of a Kind around a Node, if any. */
	const around = (node: string, kind: string) => {
		for (let at = parentOf.get(node); at !== undefined; at = parentOf.get(at)) {
			if (kindOf.get(at) === kind) {
				return at;
			}
		}
		return undefined;
	};
	return (from, to) =>
		(["region", "zone"] as const).find((kind) => {
			const [a, b] = [around(from, kind), around(to, kind)];
			return a !== undefined && b !== undefined && a !== b;
		});
}

/**
 * The middle of the stretch of a route that's its Edge's own: past the
 * stretch it shares out of its source's Port, and short of the stretch it
 * shares into its target's. When the shared stretches leave nothing between
 * them, the middle of the whole route.
 */
function ownMiddle(route: RoutePoint[], sharedOut: number, sharedIn: number): Point {
	const length = lengthOf(route);
	const middle = sharedOut < length - sharedIn ? (sharedOut + length - sharedIn) / 2 : length / 2;
	let start = 0;
	for (let index = 1; index < route.length; index += 1) {
		const from = route[index - 1];
		const to = route[index];
		if (from === undefined || to === undefined) {
			break;
		}
		const run = lengthOf([from, to]);
		if (middle <= start + run) {
			const heading = headingOf(from, to);
			return { x: from.x + heading.x * (middle - start), y: from.y + heading.y * (middle - start) };
		}
		start += run;
	}
	return { x: route.at(-1)?.x ?? 0, y: route.at(-1)?.y ?? 0 };
}

/**
 * Where the Edges that leave one Port part: for each Port that feeds two or
 * more Edges, each point where two of their routes stop running together.
 * The Ports come in the order of their first Edges, and each one's junctions
 * from the nearest to it.
 */
export function junctionsOf(edges: RoutedEdge[]): SceneJunction[] {
	return [...byPort(edges, "fromPort").values()].flatMap((feeding) => {
		const parts = new Map<string, { point: Point; length: number }>();
		feeding.forEach((a, index) => {
			for (const b of feeding.slice(index + 1)) {
				const part = parting(a.route, b.route);
				parts.set(pointKey(part.point), part);
			}
		});
		const [{ from, fromRow } = { from: "" }] = feeding;
		return [...parts.values()]
			.sort((a, b) => a.length - b.length || a.point.x - b.point.x || a.point.y - b.point.y)
			.map(({ point }) => ({
				point: { x: point.x, y: point.y },
				node: from,
				...(fromRow === undefined ? {} : { row: fromRow }),
			}));
	});
}

/** Whether a chevron fits at a point of a run that heads one way. */
type Clear = (point: Point, heading: Point) => boolean;

/**
 * Whether a point keeps clear of every corner on its line, whichever Edge
 * turns there. Edges that share a lane then agree on where a chevron fits,
 * even beside a corner that only one of them turns at.
 */
function clearOfCorners(edges: RoutedEdge[]): Clear {
	const corners = new Map<string, { at: number; radius: number }[]>();
	const add = (line: string, at: number, radius: number) => {
		corners.set(line, [...(corners.get(line) ?? []), { at, radius }]);
	};
	for (const { route } of edges) {
		for (const point of route.slice(1, -1)) {
			add(`y ${point.y}`, point.x, point.radius);
			add(`x ${point.x}`, point.y, point.radius);
		}
	}
	return (point, heading) => {
		const [line, at] = heading.y === 0 ? [`y ${point.y}`, point.x] : [`x ${point.x}`, point.y];
		return (corners.get(line) ?? []).every(
			(corner) => Math.abs(at - corner.at) >= corner.radius + chevronRoom,
		);
	};
}

/**
 * An Edge's chevrons: at a fixed spacing back from its target, wherever that
 * falls at least `fromSource` past its source, on a straight stretch clear of
 * the corners' arcs. They're worked out walking back from the target, so that
 * Edges that end along the same runs get exactly the same chevrons there.
 */
function chevronsOf(route: RoutePoint[], fromSource: number, clear: Clear): SceneChevron[] {
	const length = lengthOf(route);
	const chevrons: SceneChevron[] = [];
	for (let back = firstChevron; length - back >= fromSource; back += chevronSpacing) {
		const chevron = chevronAt(route, back);
		if (chevron !== undefined && clear(chevron.point, chevron.heading)) {
			chevrons.push(chevron);
		}
	}
	return chevrons;
}

/**
 * The one chevron of an Edge that the spacing leaves without any: as near the
 * middle of the stretch it shares with no other Edge as a chevron fits, if one
 * fits there at all.
 */
function middleChevron(
	route: RoutePoint[],
	fromSource: number,
	intoTarget: number,
	clear: Clear,
): SceneChevron[] {
	const last = lengthOf(route) - fromSource;
	const middle = Math.round((intoTarget + last) / 2);
	for (let offset = 0; middle - offset >= intoTarget || middle + offset <= last; offset += 1) {
		for (const back of [middle + offset, middle - offset]) {
			const chevron = back >= intoTarget && back <= last ? chevronAt(route, back) : undefined;
			if (chevron !== undefined && clear(chevron.point, chevron.heading)) {
				return [chevron];
			}
		}
	}
	return [];
}

/**
 * The point a distance back from a route's target, walking back along its
 * runs, and the way the route heads there. A point where two runs meet
 * belongs to neither, since no chevron fits at a corner.
 */
function chevronAt(route: RoutePoint[], back: number): SceneChevron | undefined {
	let end = 0;
	for (let index = route.length - 1; index > 0; index -= 1) {
		const near = route[index];
		const far = route[index - 1];
		if (near === undefined || far === undefined) {
			break;
		}
		const run = lengthOf([far, near]);
		if (back < end + run) {
			const along = back - end;
			const heading = headingOf(far, near);
			return along <= 0
				? undefined
				: { point: { x: near.x - heading.x * along, y: near.y - heading.y * along }, heading };
		}
		end += run;
	}
	return undefined;
}

/**
 * Where two routes from one point part: how far they run together, along the
 * same runs in the same direction, and the point where they stop, which is a
 * corner of one of them.
 */
function parting(a: Point[], b: Point[]): { point: Point; length: number } {
	let at = a[0] ?? { x: 0, y: 0 };
	let length = 0;
	let i = 1;
	let j = 1;
	for (;;) {
		const nextA = a[i];
		const nextB = b[j];
		if (nextA === undefined || nextB === undefined) {
			break;
		}
		const wayA = headingOf(at, nextA);
		const wayB = headingOf(at, nextB);
		if (wayA.x !== wayB.x || wayA.y !== wayB.y) {
			break;
		}
		const toA = lengthOf([at, nextA]);
		const toB = lengthOf([at, nextB]);
		length += Math.min(toA, toB);
		at = toA <= toB ? nextA : nextB;
		i += toA <= toB ? 1 : 0;
		j += toB <= toA ? 1 : 0;
	}
	return { point: at, length };
}

/** The length of a polyline whose runs are horizontal or vertical. */
function lengthOf(points: Point[]): number {
	let length = 0;
	for (let index = 1; index < points.length; index += 1) {
		const from = points[index - 1];
		const to = points[index];
		if (from !== undefined && to !== undefined) {
			length += Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
		}
	}
	return length;
}

/** The unit vector along a horizontal or vertical run. */
function headingOf(from: Point, to: Point): Point {
	return { x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y) };
}

function pointKey({ x, y }: Point): string {
	return `${x} ${y}`;
}
