/**
 * The path data of what the SVG writer draws along an Edge: its line, in
 * pieces between hops, with its corners' arcs; its arrowhead; its chevrons;
 * and the globe on its badge, when it crosses between Groups.
 */

import { headingOf } from "./geometry.ts";
import { markSizes } from "./marks.ts";
import type { Point, RoutePoint, SceneChevron, SceneEdge, ScenePort } from "./scene.ts";
import { number } from "./xml.ts";

/**
 * The arrowhead at an Edge's target: how far it reaches back from its tip, and
 * half its width there. Its outline is the casing's, a pixel wide.
 */
const arrowLength = 8;
const arrowHalfWidth = 4.5;
export const arrowOutline = 1;
/** The globe on a badge: its radius, and the half-width of its meridian. */
const globeRadius = 3.5;
const meridian = 1.5;

/**
 * The path data of an Edge's line: each piece of its stroke, between hops, as
 * a subpath of its own, so that hops show as gaps in both casing and body.
 * Under an arrowhead, the piece at the target stops just inside it, so that
 * the casing doesn't show beside the tip. The pieces are written from the
 * target back, so that the dashes of a dashed line start there: the Edges of
 * one bundle end at one Port, hop together, and so dash alike along the trunk
 * they share.
 */
export function linePath({ route, stroke }: SceneEdge, arrow: boolean): string {
	const pieces = stroke.length === 0 ? [route] : stroke;
	return pieces
		.map((piece, index) =>
			arrow && index === pieces.length - 1
				? trimmed(piece, arrowLength - arrowOutline)
				: [...piece],
		)
		.reverse()
		.map((piece) => pathData(piece.reverse()))
		.join(" ");
}

/** A chevron's path data: its two arms, which meet at its tip. */
export function chevronPath({ point, heading: way }: SceneChevron): string {
	const tip = {
		x: point.x + (way.x * markSizes.chevron.length) / 2,
		y: point.y + (way.y * markSizes.chevron.length) / 2,
	};
	const back = {
		x: point.x - (way.x * markSizes.chevron.length) / 2,
		y: point.y - (way.y * markSizes.chevron.length) / 2,
	};
	const across = {
		x: -way.y * markSizes.chevron.halfWidth,
		y: way.x * markSizes.chevron.halfWidth,
	};
	return [
		`M ${number(back.x + across.x)} ${number(back.y + across.y)}`,
		`L ${number(tip.x)} ${number(tip.y)}`,
		`L ${number(back.x - across.x)} ${number(back.y - across.y)}`,
	].join(" ");
}

/**
 * The arrowhead at a Port: a triangle whose tip touches the Node's side, and
 * which points into the Node, along the Port's stub.
 */
export function arrowhead({ point, stub }: ScenePort): string {
	const into = headingOf(stub, point);
	const base = { x: point.x - into.x * arrowLength, y: point.y - into.y * arrowLength };
	const across = { x: -into.y * arrowHalfWidth, y: into.x * arrowHalfWidth };
	return [
		`M ${number(point.x)} ${number(point.y)}`,
		`L ${number(base.x + across.x)} ${number(base.y + across.y)}`,
		`L ${number(base.x - across.x)} ${number(base.y - across.y)}`,
		"Z",
	].join(" ");
}

/**
 * A route with its target end moved back along its last run, by up to `by`,
 * but never into the arc of the corner before it.
 */
function trimmed(route: RoutePoint[], by: number): RoutePoint[] {
	const end = route.at(-1);
	const before = route.at(-2);
	if (end === undefined || before === undefined) {
		return [...route];
	}
	const room = Math.abs(end.x - before.x) + Math.abs(end.y - before.y) - before.radius;
	const cut = Math.max(0, Math.min(by, room));
	const back = headingOf(end, before);
	return [...route.slice(0, -1), { x: end.x + back.x * cut, y: end.y + back.y * cut, radius: 0 }];
}

/**
 * A route's path data: its runs as lines, and each rounded corner as an arc
 * from where the arc meets the run before it to where it meets the run after.
 */
function pathData(route: RoutePoint[]): string {
	const commands: string[] = [];
	let pen: Point | undefined;
	const lineTo = (point: Point) => {
		if (pen === undefined || pen.x !== point.x || pen.y !== point.y) {
			commands.push(`${pen === undefined ? "M" : "L"} ${number(point.x)} ${number(point.y)}`);
		}
		pen = point;
	};
	route.forEach((point, index) => {
		const before = route[index - 1];
		const after = route[index + 1];
		if (before === undefined || after === undefined || point.radius === 0) {
			lineTo(point);
			return;
		}
		const { radius } = point;
		const into = headingOf(before, point);
		const out = headingOf(point, after);
		lineTo({ x: point.x - into.x * radius, y: point.y - into.y * radius });
		const end = { x: point.x + out.x * radius, y: point.y + out.y * radius };
		// With y pointing down, a turn whose cross product is positive is clockwise
		// on screen, which is the direction of SVG's sweep flag 1.
		const sweep = into.x * out.y - into.y * out.x > 0 ? 1 : 0;
		commands.push(
			`A ${number(radius)} ${number(radius)} 0 0 ${sweep} ${number(end.x)} ${number(end.y)}`,
		);
		pen = end;
	});
	return commands.join(" ");
}

/** The globe on a crossing Edge's badge, centered on its point: a circle, a meridian and an equator. */
export function globePath({ x, y }: Point): string {
	const [left, right, top, bottom] = [
		x - globeRadius,
		x + globeRadius,
		y - globeRadius,
		y + globeRadius,
	];
	const r = number(globeRadius);
	return [
		`M ${number(left)} ${number(y)} A ${r} ${r} 0 1 0 ${number(right)} ${number(y)}`,
		`A ${r} ${r} 0 1 0 ${number(left)} ${number(y)} Z`,
		`M ${number(x)} ${number(top)} A ${number(meridian)} ${r} 0 0 0 ${number(x)} ${number(bottom)}`,
		`A ${number(meridian)} ${r} 0 0 0 ${number(x)} ${number(top)} Z`,
		`M ${number(left)} ${number(y)} H ${number(right)}`,
	].join(" ");
}
