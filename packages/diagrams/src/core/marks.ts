/**
 * The marks along each routed Edge (spec: Static SVG, Look): the chevrons
 * that show which way it runs, the junctions where Edges that leave one Port
 * part, and the badge of an Edge that crosses between Groups, as one between
 * architecture's regions or zones does.
 * They're plain geometry in the scene, so that any renderer draws them alike.
 * They're placed once the routes are final, broken at hops, and labeled.
 *
 * Every distance here is measured along a route's runs, from corner point to
 * corner point, ignoring the arcs that round the corners.
 */

import { type AnyDiagram, parentsOf } from "../authoring/model.ts";
import { definitionOf, type Notation } from "../notations/notation.ts";
import { flowOf } from "./flow.ts";
import { headingOf } from "./geometry.ts";
import type { Box, Point, RoutePoint, SceneChevron, SceneEdge, SceneJunction } from "./scene.ts";

/**
 * Chevrons sit at this spacing back from the target, the first of them this
 * far from it, which is the middle of an Edge between neighboring ranks.
 */
const chevronSpacing = 128;
const firstChevron = 48;
/**
 * How far a chevron's middle keeps from a corner's arc, or from a hop's gap:
 * half its length along its run, and some clearance.
 */
const chevronRoom = 2 + 4;
/**
 * How big the marks along an Edge are drawn, as the SVG writer draws them: the
 * casing that each mark has, as the Edge's line does; a chevron's length
 * along its run, its tip half of that ahead of its point, and how far its
 * arms reach to each side; and a badge's radius, and its outline.
 */
export const markSizes = {
	casing: 3.5,
	chevron: { length: 4, halfWidth: 3.5 },
	badge: { radius: 7, outline: 1 },
} as const;

/**
 * How far a chevron's drawing, and a badge's, reach from their points along
 * either axis, casing included, to the next whole pixel, so that neither is
 * placed under a label, which is drawn over the Edges.
 */
const { casing, chevron, badge } = markSizes;
const chevronReach = Math.ceil(Math.max(chevron.halfWidth, chevron.length / 2) + casing / 2);
const badgeReach = Math.ceil(badge.radius + badge.outline / 2);
/**
 * How far an Edge's chevrons keep from the stretches it shares with other
 * Edges: out of its source's Port, as far as it leaves them, and into its
 * target's, from where it joins them. Each stretch is at least the Port's
 * stub, so the arrowhead, which sits on the target's stub, keeps clear too.
 */
const sharedClearance = 8;

/** Which Edges share a Port, by the point where it sits on its Node. */
function byPort(edges: SceneEdge[], end: "fromPort" | "toPort"): Map<string, SceneEdge[]> {
	const found = new Map<string, SceneEdge[]>();
	for (const edge of edges) {
		const key = pointKey(edge[end].point);
		const sharing = found.get(key);
		if (sharing === undefined) {
			found.set(key, [edge]);
		} else {
			sharing.push(edge);
		}
	}
	return found;
}

/**
 * Each Edge with its marks: the router leaves its chevrons empty, and its
 * crossing unset. An Edge of a symmetric Kind runs neither way, so it gets no
 * chevrons.
 */
export function markEdges(
	diagram: AnyDiagram,
	notation: Notation,
	edges: SceneEdge[],
): SceneEdge[] {
	const fromPort = byPort(edges, "fromPort");
	const toPort = byPort(edges, "toPort");
	const clear = clearOf(edges);
	const labels = edges.flatMap(drawnOver);
	const crossing = crossingOf(diagram, notation);
	const rates = new Map(diagram.edges.map((edge) => [edge.id, edge.rate]));
	return edges.map((edge) => {
		const others = (sharing: Map<string, SceneEdge[]>, end: "fromPort" | "toPort") =>
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
		// Its role tags sit at the ends of the stretch that's its own, so its
		// marks keep to what's left between them.
		const length = lengthOf(edge.route);
		const tagged = (end: "from" | "to") =>
			edge.roles.flatMap((role) => {
				const covered = role.end === end ? coveredAlong(edge.route, role.tag) : undefined;
				return covered === undefined ? [] : [end === "from" ? covered.end : length - covered.start];
			});
		const fromSource = Math.max(sharedOut, ...tagged("from")) + sharedClearance;
		const intoTarget = Math.max(sharedIn, ...tagged("to")) + sharedClearance;
		const chevrons = chevronsOf(edge.route, fromSource, clear);
		const kind = crossing(edge.from, edge.to);
		return {
			...edge,
			...(notation.flow && definitionOf(notation.edgeKinds, edge.kind).symmetric !== true
				? { flow: flowOf(rates.get(edge.id)) }
				: {}),
			chevrons:
				definitionOf(notation.edgeKinds, edge.kind).symmetric === true
					? []
					: chevrons.length > 0
						? chevrons
						: middleChevron(edge.route, fromSource, intoTarget, clear),
			...(kind === undefined
				? {}
				: { crosses: { kind, badge: badgeOf(edge.route, sharedOut, sharedIn, labels) } }),
		};
	});
}

/**
 * What's drawn over an Edge's line, which no mark may sit under: its label,
 * and its role tags.
 */
function drawnOver({ label, roles }: SceneEdge): Box[] {
	return [...(label === undefined ? [] : [label.box]), ...roles.map(({ tag }) => tag)];
}

/**
 * Which Kind of Groups an Edge between two Nodes crosses between: the first
 * Group Kind, among those whose definition says that Edges cross between
 * them, for which its ends sit in different Groups, as an architecture Edge
 * crosses regions, or else zones. Each end counts the innermost Group of each
 * Kind around it, and an end in no Group of a Kind crosses nothing of that
 * Kind.
 */
function crossingOf(
	diagram: AnyDiagram,
	notation: Notation,
): (from: string, to: string) => string | undefined {
	const crossed = Object.entries(notation.groupKinds).flatMap(([kind, { crossing }]) =>
		crossing === undefined ? [] : [kind],
	);
	const parentOf = parentsOf(diagram);
	const kindOf = new Map<string, string>(diagram.groups.map((group) => [group.id, group.kind]));
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
		crossed.find((kind) => {
			const [a, b] = [around(from, kind), around(to, kind)];
			return a !== undefined && b !== undefined && a !== b;
		});
}

/**
 * Where an Edge's badge goes: the middle of the stretch of its route that's
 * its own, past the stretch it shares out of its source's Port and short of
 * the stretch it shares into its target's, or as near it along that stretch
 * as clears every label. When the shared stretches leave nothing between
 * them, the middle of the whole route.
 */
function badgeOf(route: RoutePoint[], sharedOut: number, sharedIn: number, labels: Box[]): Point {
	const length = lengthOf(route);
	if (sharedOut >= length - sharedIn) {
		return pointAlong(route, length / 2);
	}
	const middle = (sharedOut + length - sharedIn) / 2;
	for (let offset = 0; offset <= middle - sharedOut; offset += 1) {
		for (const distance of [middle - offset, middle + offset]) {
			const point = pointAlong(route, distance);
			if (labels.every((label) => !reaches(point, badgeReach, label))) {
				return point;
			}
		}
	}
	return pointAlong(route, middle);
}

/**
 * The stretch of a route that a box covers: how far along the route, from
 * its source, the first point that the box covers lies, and the last, if it
 * covers any.
 */
function coveredAlong(route: RoutePoint[], box: Box): { start: number; end: number } | undefined {
	let start = 0;
	let covered: { start: number; end: number } | undefined;
	for (let index = 1; index < route.length; index += 1) {
		const from = route[index - 1];
		const to = route[index];
		if (from === undefined || to === undefined) {
			break;
		}
		const horizontal = from.y === to.y;
		const [line, a, b] = horizontal ? [from.y, from.x, to.x] : [from.x, from.y, to.y];
		const [near, low, size] = horizontal ? [box.y, box.x, box.width] : [box.x, box.y, box.height];
		const across = horizontal ? box.height : box.width;
		const first = Math.max(Math.min(a, b), low);
		const last = Math.min(Math.max(a, b), low + size);
		if (near <= line && line <= near + across && first <= last) {
			const [one, other] = [start + Math.abs(first - a), start + Math.abs(last - a)];
			covered = {
				start: Math.min(covered?.start ?? one, one, other),
				end: Math.max(covered?.end ?? one, one, other),
			};
		}
		start += Math.abs(b - a);
	}
	return covered;
}

/** The point a distance along a route from its source. */
function pointAlong(route: RoutePoint[], distance: number): Point {
	let start = 0;
	for (let index = 1; index < route.length; index += 1) {
		const from = route[index - 1];
		const to = route[index];
		if (from === undefined || to === undefined) {
			break;
		}
		const run = lengthOf([from, to]);
		if (distance <= start + run) {
			const heading = headingOf(from, to);
			return {
				x: from.x + heading.x * (distance - start),
				y: from.y + heading.y * (distance - start),
			};
		}
		start += run;
	}
	return { x: route.at(-1)?.x ?? 0, y: route.at(-1)?.y ?? 0 };
}

/** Whether a drawing that reaches this far from a point, in any direction, would overlap a box. */
function reaches(point: Point, reach: number, box: Box): boolean {
	return (
		point.x + reach > box.x &&
		point.x - reach < box.x + box.width &&
		point.y + reach > box.y &&
		point.y - reach < box.y + box.height
	);
}

/**
 * Where the Edges that leave one Port part: for each Port that feeds two or
 * more Edges, each point where two of their routes stop running together.
 * The Ports come in the order of their first Edges, and each one's junctions
 * from the nearest to it.
 */
export function junctionsOf(edges: SceneEdge[]): SceneJunction[] {
	return [...byPort(edges, "fromPort").values()].flatMap((feeding) => {
		const [first] = feeding;
		const parts = new Map<string, { point: Point; length: number }>();
		feeding.forEach((a, index) => {
			for (const b of feeding.slice(index + 1)) {
				const part = parting(a.route, b.route);
				parts.set(pointKey(part.point), part);
			}
		});
		return first === undefined
			? []
			: [...parts.values()]
					.sort((a, b) => a.length - b.length || a.point.x - b.point.x || a.point.y - b.point.y)
					.map(({ point }) => ({
						point: { x: point.x, y: point.y },
						node: first.from,
						...(first.fromRow === undefined ? {} : { row: first.fromRow }),
					}));
	});
}

/** Whether a chevron fits at a point of a run that heads one way. */
type Clear = (point: Point, heading: Point) => boolean;

/**
 * Whether a chevron fits at a point: clear of every corner on its line and
 * every gap a hop leaves there, whichever Edge turns or hops there, and clear
 * of every label. Edges that share a lane then agree on where a chevron fits,
 * even beside a corner that only one of them turns at.
 */
function clearOf(edges: SceneEdge[]): Clear {
	// What each line holds, by how far along it, and how far either way it reaches.
	const taken = new Map<string, { at: number; reach: number }[]>();
	const take = (line: string, at: number, reach: number) => {
		const list = taken.get(line);
		if (list === undefined) {
			taken.set(line, [{ at, reach }]);
		} else {
			list.push({ at, reach });
		}
	};
	const labels: Box[] = edges.flatMap(drawnOver);
	for (const { route, stroke } of edges) {
		for (const point of route.slice(1, -1)) {
			take(`y ${point.y}`, point.x, point.radius);
			take(`x ${point.x}`, point.y, point.radius);
		}
		stroke.slice(1).forEach((piece, index) => {
			const end = stroke[index]?.at(-1);
			const start = piece[0];
			if (end !== undefined && start !== undefined) {
				const [line, a, b] =
					end.y === start.y ? [`y ${end.y}`, end.x, start.x] : [`x ${end.x}`, end.y, start.y];
				take(line, (a + b) / 2, Math.abs(a - b) / 2);
			}
		});
	}
	return (point, heading) => {
		const [line, at] = heading.y === 0 ? [`y ${point.y}`, point.x] : [`x ${point.x}`, point.y];
		return (
			(taken.get(line) ?? []).every(
				(thing) => Math.abs(at - thing.at) >= thing.reach + chevronRoom,
			) && labels.every((box) => !reaches(point, chevronReach, box))
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
 * The one chevron an Edge gets when the spacing gives it none: as near the
 * middle of the stretch it shares with no other Edge as a chevron fits, if
 * one fits there at all.
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

function pointKey({ x, y }: Point): string {
	return `${x} ${y}`;
}
