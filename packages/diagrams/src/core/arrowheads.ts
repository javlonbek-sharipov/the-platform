/** Keep directed markers off symmetric strokes, including shared terminal stubs. */
import { definitionOf, type Notation } from "../notations/notation.ts";
import type { Diagnostic } from "./diagnostics.ts";
import { headingOf } from "./geometry.ts";
import type { Box, Point, SceneChevron, SceneEdge } from "./scene.ts";

export const arrowSize = { length: 8, halfWidth: 4.5, outline: 1 } as const;

/** A conservative box around the triangle, including its outline. */
function bounds({ point, heading }: SceneChevron): Box {
	const back = {
		x: point.x - heading.x * arrowSize.length,
		y: point.y - heading.y * arrowSize.length,
	};
	const x = Math.abs(heading.y) * arrowSize.halfWidth + arrowSize.outline / 2;
	const y = Math.abs(heading.x) * arrowSize.halfWidth + arrowSize.outline / 2;
	return {
		x: Math.min(point.x, back.x) - x,
		y: Math.min(point.y, back.y) - y,
		width: Math.abs(point.x - back.x) + 2 * x,
		height: Math.abs(point.y - back.y) + 2 * y,
	};
}

function overlaps(a: Box, b: Box): boolean {
	return (
		a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
	);
}

/** Straight runs and corner arcs, conservatively bounded with their casing. */
function strokeBounds(edges: SceneEdge[]): Box[] {
	const reach = 1.75;
	const around = (from: Point, to: Point): Box => ({
		x: Math.min(from.x, to.x) - reach,
		y: Math.min(from.y, to.y) - reach,
		width: Math.abs(to.x - from.x) + 2 * reach,
		height: Math.abs(to.y - from.y) + 2 * reach,
	});
	return edges.flatMap(({ route }) =>
		route.slice(1).flatMap((to, i) => {
			const from = route[i] ?? to;
			const heading = headingOf(from, to);
			const start = { x: from.x + heading.x * from.radius, y: from.y + heading.y * from.radius };
			const end = { x: to.x - heading.x * to.radius, y: to.y - heading.y * to.radius };
			const next = route[i + 2];
			if (next === undefined || to.radius === 0) return [around(start, end)];
			const out = headingOf(to, next);
			return [
				around(start, end),
				around(end, { x: to.x + out.x * to.radius, y: to.y + out.y * to.radius }),
			];
		}),
	);
}

export function placeArrowheads(
	notation: Notation,
	edges: SceneEdge[],
	obstacles: Box[],
): Diagnostic[] {
	const symmetric = edges.filter(
		(edge) => definitionOf(notation.edgeKinds, edge.kind).symmetric === true,
	);
	const strokes = strokeBounds(symmetric);
	const covered = edges.flatMap(({ label, roles }) => [
		...(label === undefined ? [] : [label.box]),
		...roles.map(({ tag }) => tag),
	]);
	const diagnostics: Diagnostic[] = [];
	for (const [index, edge] of edges.entries()) {
		if (definitionOf(notation.edgeKinds, edge.kind).symmetric === true) continue;
		const atPort = {
			point: edge.toPort.point,
			heading: headingOf(edge.toPort.stub, edge.toPort.point),
		};
		if (strokes.every((stroke) => !overlaps(bounds(atPort), stroke))) {
			edge.arrowhead = atPort;
			continue;
		}
		// Preserve the Port and every routed run. Walk back to the nearest
		// straight piece where this marker belongs to the directed stroke alone.
		search: for (const piece of [...edge.stroke].reverse()) {
			for (let i = piece.length - 1; i > 0; i -= 1) {
				const near = piece[i];
				const far = piece[i - 1];
				if (near === undefined || far === undefined) continue;
				const heading = headingOf(far, near);
				const length = Math.abs(near.x - far.x) + Math.abs(near.y - far.y);
				for (
					let back = near.radius + 1;
					back + arrowSize.length + far.radius + 1 <= length;
					back += 1
				) {
					const point: Point = { x: near.x - heading.x * back, y: near.y - heading.y * back };
					const candidate = { point, heading };
					const box = bounds(candidate);
					if ([...strokes, ...obstacles, ...covered].every((other) => !overlaps(box, other))) {
						edge.arrowhead = candidate;
						break search;
					}
				}
			}
		}
		if (edge.arrowhead === undefined)
			diagnostics.push({
				severity: "warning",
				rule: "arrow-placement",
				pointer: `/edges/${index}`,
				message: `Edge \`${edge.id}\` has no room for an arrowhead clear of symmetric strokes. Its arrowhead is omitted; separate its route from the symmetric Edges.`,
			});
	}
	return diagnostics;
}
