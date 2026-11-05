/**
 * Edge labels (spec: Edge routing, step 8). Each Edge that has a label, a
 * Technology or a rate gets a box beside its route, with its label's text on
 * the first line, and its Technology and rate on the line below.
 *
 * The box goes beside the longest straight run that belongs to its Edge
 * alone, centered along it: not along a trunk, a Port's stub, or a corner's
 * arc. It tries one side of the run, then the other. If the box would cover a
 * Node, a callout's tag, a Port's stub, a Group label or another label there,
 * it tries the next-longest run, and so on. When no run has room, it goes to
 * the route's midpoint, with a warning that says why: the Edge has no run of
 * its own, its label is too long for every one, or none has room clear of
 * the rest.
 *
 * Labels are placed in three passes, each in the order of their Edges' ids.
 * The first places each label in full, and only where it also covers no
 * route and no Group's border, so that it hides nothing. The second places
 * the rest in full wherever they cover nothing else, and the third shortened,
 * if they must be, to fit the run.
 *
 * A trunk may take a run that a label needs. A labeled Edge that rides a
 * trunk with no run of its own left that holds its label in full is crowded
 * out: the caller routes it again in a lane of its own.
 */

import type { AnyEdge, Direction } from "../authoring/model.ts";
import { compareText } from "./bundles.ts";
import type { Diagnostic } from "./diagnostics.ts";
import type { LineSpan } from "./geometry.ts";
import type {
	Box,
	Point,
	RoutePoint,
	SceneEdge,
	SceneGroup,
	SceneLabel,
	SceneNode,
} from "./scene.ts";
import { technologyOf } from "./technology.ts";
import {
	type LabelContent,
	type LabelTechnology,
	labelBoxSize,
	labelTexts,
	labelWidth,
} from "./text.ts";

/**
 * How labels keep clear: the gap between a label's box and the line it sits
 * beside, and the margin it keeps from Nodes, tags, Port stubs, Group labels
 * and other labels.
 */
export const labelSpacing = { gap: 4, margin: 4 };

/**
 * The room a gap between ranks leaves at each end of a label, along the run
 * it sits beside, so that the label clears its run's corners.
 */
export const labelEnds = 8;

/** The narrowest a label's texts are shortened to, to fit a run, unless they're narrower in full. */
const narrowest = 48;

/** Two lines closer than this are one, as two routes in one lane are. */
const sameLine = 0.5;

/**
 * What an Edge's label shows, if it shows anything. Its Technology shows by
 * its display name, after its logo, or by its slug when it has no logo.
 */
export function labelContent(edge: AnyEdge): LabelContent | undefined {
	const { label, technology, rate } = edge;
	if (label === undefined && technology === undefined && rate === undefined) {
		return undefined;
	}
	return {
		...(label === undefined ? {} : { text: label }),
		...(technology === undefined ? {} : { technology: labelTechnology(technology) }),
		...(rate === undefined ? {} : { rate }),
	};
}

/** A Technology as a label shows it: by its name, after its logo if it has one. */
function labelTechnology(slug: string): LabelTechnology {
	const { name, logo } = technologyOf(slug);
	return { slug, name, logo: logo !== undefined };
}

/** The size of an Edge's label box, if the Edge has a label, a Technology or a rate. */
export function labelSize(edge: AnyEdge): { width: number; height: number } | undefined {
	const content = labelContent(edge);
	return content === undefined ? undefined : labelBoxSize(content, labelWidth(content));
}

/** A straight stretch of a route, along one line. */
type Stretch = LineSpan;

/** A horizontal or vertical segment. */
type Segment = [Point, Point];

export interface Labeling {
	/** Each Edge's label, by the Edge's id. */
	labels: Map<string, SceneLabel>;
	/** A warning for each label that no run had room for. */
	diagnostics: Diagnostic[];
	/**
	 * The labeled Edges that share a lane with Edges of their lane group, as a
	 * trunk does, and have no run of their own that holds their label in full.
	 * Each should keep a lane of its own instead (spec: Edge routing, step 8).
	 */
	crowdedOut: string[];
}

/**
 * Places each Edge's label, given each Edge's lane group, whose Edges may
 * share a lane, as a bundle's trunk does.
 */
export function placeLabels(
	diagram: { direction: Direction; edges: AnyEdge[] },
	nodes: SceneNode[],
	groups: SceneGroup[],
	edges: SceneEdge[],
	laneGroupOf: Map<string, string>,
): Labeling {
	const byId = new Map(edges.map((edge) => [edge.id, edge]));
	const runs = new Map(edges.map((edge) => [edge.id, runsOf(edge.route, false)]));
	// Labels stay clear of these, and of each other.
	const solid: Box[] = [
		...nodes.flatMap(({ box, callout }) => (callout === undefined ? [box] : [box, callout.tag])),
		...groups.map(({ label }) => label),
	];
	const stubs: Segment[] = [
		...new Map(
			edges.flatMap(({ fromPort, toPort }) =>
				[fromPort, toPort].map(
					(port) =>
						[`${port.point.x} ${port.point.y}`, [port.point, port.stub] as Segment] as const,
				),
			),
		).values(),
	];
	// The first pass keeps labels off these too.
	const lines: Segment[] = [
		...edges.flatMap(({ route }) =>
			route.slice(1).map((to, index): Segment => [route[index] ?? to, to]),
		),
		...groups.flatMap(({ box }) => sidesOf(box)),
	];
	const borders = groups.map(({ box }) => box);
	const placed: Box[] = [];
	const covers = (box: Box) => {
		const room = grown(box, labelSpacing.margin);
		return (
			solid.some((other) => overlaps(room, other)) ||
			placed.some((other) => overlaps(room, other)) ||
			stubs.some(([a, b]) => crosses(room, a, b))
		);
	};
	const hides = (box: Box) => lines.some(([a, b]) => crosses(box, a, b));

	const wanted = diagram.edges
		.flatMap((edge, index) => {
			const content = labelContent(edge);
			const scene = byId.get(edge.id);
			if (content === undefined || scene === undefined) {
				return [];
			}
			const others = edges.flatMap((other) => (other === scene ? [] : (runs.get(other.id) ?? [])));
			const stretches = ownStretches(scene, others, borders);
			const candidates = [...stretches]
				.sort((a, b) => b.high - b.low - (a.high - a.low))
				.flatMap((stretch) =>
					sidesFor(stretch, diagram.direction).flatMap((side) => {
						const box = fitted(content, stretch, side);
						return box === undefined ? [] : [box];
					}),
				);
			const natural = labelBoxSize(content, labelWidth(content));
			return [{ edge, index, content, scene, stretches, candidates, natural }];
		})
		.sort((a, b) => compareText(a.edge.id, b.edge.id));

	// A labeled Edge may ride its bundle's trunk only where a run of its own
	// still holds its label in full. One whose lane group's routes run along it
	// with no such run left is crowded out, and should keep a lane of its own.
	const crowdedOut = wanted.flatMap(({ edge, scene, stretches, natural }) => {
		const group = laneGroupOf.get(edge.id);
		const mates = edges.flatMap((other) =>
			other !== scene && laneGroupOf.get(other.id) === group ? (runs.get(other.id) ?? []) : [],
		);
		const rides = ownStretches(scene, [], []).some((stretch) => alongAny(stretch, mates));
		const holds = stretches.some(
			(stretch) =>
				(stretch.horizontal ? natural.width : natural.height) <= stretch.high - stretch.low,
		);
		return rides && !holds ? [edge.id] : [];
	});

	// The first pass places labels in full where they hide nothing, the second
	// in full wherever they cover nothing else, and the third shortened if need be.
	const passes = [
		{ mayHide: false, mayShorten: false },
		{ mayHide: true, mayShorten: false },
		{ mayHide: true, mayShorten: true },
	];
	const boxes = new Map<string, Box>();
	for (const { mayHide, mayShorten } of passes) {
		for (const { edge, candidates, natural } of wanted) {
			if (boxes.has(edge.id)) {
				continue;
			}
			const box = candidates.find(
				(candidate) =>
					(mayShorten || candidate.width >= natural.width) &&
					!covers(candidate) &&
					(mayHide || !hides(candidate)),
			);
			if (box !== undefined) {
				boxes.set(edge.id, box);
				placed.push(box);
			}
		}
	}

	const labels = new Map<string, SceneLabel>();
	const diagnostics: Diagnostic[] = [];
	for (const { edge, index, content, scene, stretches, candidates } of [...wanted].sort(
		(a, b) => a.index - b.index,
	)) {
		let box = boxes.get(edge.id);
		if (box === undefined) {
			box = atMidpoint(content, scene.route, diagram.direction);
			diagnostics.push({
				severity: "warning",
				rule: "label-placement",
				message: fellBack(
					edge.id,
					stretches.length === 0 ? "none" : candidates.length === 0 ? "short" : "covered",
				),
				pointer: `/edges/${index}`,
			});
		}
		labels.set(edge.id, { box, ...labelTexts(content, box) });
	}
	return { labels, diagnostics, crowdedOut };
}

/**
 * The warning for a label drawn at its route's midpoint, which says why: its
 * Edge has no run of its own past its stubs, every run of its own is too short
 * for it, or every run long enough has no room beside it.
 */
function fellBack(id: string, why: "none" | "short" | "covered"): string {
	const named = `Edge \`${id}\`'s label`;
	switch (why) {
		case "none":
			return `${named} has no run of its own, since other Edges run along all of its route past its stubs. So it's drawn at the middle of its route.`;
		case "short":
			return `${named} is too long for any run of the Edge's own, so it's drawn at the middle of its route. Shorten it to fit beside a run.`;
		default:
			return `${named} has no room beside any run of the Edge's own, clear of Nodes, Port stubs, Group labels and other labels, so it's drawn at the middle of its route.`;
	}
}

/** Whether any of the runs lies along the stretch, on its line, for more than a point. */
function alongAny(stretch: Stretch, runs: Stretch[]): boolean {
	return runs.some(
		(run) =>
			run.horizontal === stretch.horizontal &&
			Math.abs(run.line - stretch.line) < sameLine &&
			Math.min(run.high, stretch.high) - Math.max(run.low, stretch.low) > sameLine,
	);
}

/**
 * The sides of a stretch a label tries, in order: 1 is below a horizontal
 * stretch or right of a vertical one, and -1 above or left. A run across the
 * direction tries the side ahead first, toward the ranks that follow, since
 * the side behind is where it turned off its stub. A run along the direction
 * tries above, or right.
 */
function sidesFor(stretch: Stretch, direction: Direction): (-1 | 1)[] {
	return stretch.horizontal && direction === "right" ? [-1, 1] : [1, -1];
}

/**
 * A label's box beside a stretch, on one side, centered along it, with its
 * texts shortened to the stretch's length if they're longer, but no narrower
 * than the narrowest a label is shortened to. A stretch too short for that has
 * no room for the label.
 */
function fitted(content: LabelContent, stretch: Stretch, side: -1 | 1): Box | undefined {
	const length = stretch.high - stretch.low;
	const full = labelWidth(content);
	const natural = labelBoxSize(content, full);
	const padding = natural.width - full;
	const size = stretch.horizontal
		? labelBoxSize(content, Math.min(full, length - padding))
		: natural;
	if (
		(stretch.horizontal ? size.width : size.height) > length ||
		size.width - padding < Math.min(full, narrowest)
	) {
		return undefined;
	}
	return besideAt(stretch, size, side);
}

/** A box of the given size beside a stretch, on one side, centered along it. */
function besideAt(stretch: Stretch, size: { width: number; height: number }, side: -1 | 1): Box {
	const middle = (stretch.low + stretch.high) / 2;
	const { gap } = labelSpacing;
	return stretch.horizontal
		? {
				x: middle - size.width / 2,
				y: side < 0 ? stretch.line - gap - size.height : stretch.line + gap,
				...size,
			}
		: {
				x: side < 0 ? stretch.line - gap - size.width : stretch.line + gap,
				y: middle - size.height / 2,
				...size,
			};
}

/** A label at the middle of its route, beside the run there, when no run has room for it. */
function atMidpoint(content: LabelContent, route: RoutePoint[], direction: Direction): Box {
	const { point, horizontal } = midpointOf(route);
	const along = horizontal ? point.x : point.y;
	const stretch = { horizontal, line: horizontal ? point.y : point.x, low: along, high: along };
	const [side = 1] = sidesFor(stretch, direction);
	return besideAt(stretch, labelBoxSize(content, labelWidth(content)), side);
}

/** The point halfway along a route, and whether the run there is horizontal. */
function midpointOf(route: Point[]): { point: Point; horizontal: boolean } {
	const lengths = route.slice(1).map((point, index) => {
		const before = route[index] ?? point;
		return Math.abs(point.x - before.x) + Math.abs(point.y - before.y);
	});
	let left = lengths.reduce((sum, length) => sum + length, 0) / 2;
	for (const [index, length] of lengths.entries()) {
		const from = route[index];
		const to = route[index + 1];
		if (from !== undefined && to !== undefined && left <= length) {
			const share = length === 0 ? 0 : left / length;
			return {
				point: { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share },
				horizontal: from.y === to.y,
			};
		}
		left -= length;
	}
	return { point: route[0] ?? { x: 0, y: 0 }, horizontal: true };
}

/**
 * Each run of a route, from corner to corner, or, `straight`, only its
 * straight part, between the arcs that round its corners.
 */
function runsOf(route: RoutePoint[], straight: boolean): Stretch[] {
	return route.slice(1).flatMap((to, index): Stretch[] => {
		const from = route[index];
		if (from === undefined) {
			return [];
		}
		const horizontal = from.y === to.y;
		const [a, b] = horizontal ? [from.x, to.x] : [from.y, to.y];
		const [lowEnd, highEnd] = a < b ? [from, to] : [to, from];
		return [
			{
				horizontal,
				line: horizontal ? from.y : from.x,
				low: Math.min(a, b) + (straight ? lowEnd.radius : 0),
				high: Math.max(a, b) - (straight ? highEnd.radius : 0),
			},
		];
	});
}

/**
 * The stretches of an Edge's route that belong to it alone: each run's
 * straight part, beyond the stubs of the Edge's two Ports, less every part
 * that another route runs along too, as a trunk does. A run that crosses a
 * Group's border makes a stretch on each side of it, so that a label centered
 * on one doesn't sit across the border. They come in the order of the route.
 */
function ownStretches(edge: SceneEdge, others: Stretch[], borders: Box[]): Stretch[] {
	return runsOf(edge.route, true).flatMap((run) => {
		const cuts: [number, number][] = [];
		for (const { point, stub } of [edge.fromPort, edge.toPort]) {
			const alongStub = run.horizontal ? point.y === stub.y : point.x === stub.x;
			if (alongStub && Math.abs((run.horizontal ? point.y : point.x) - run.line) < sameLine) {
				const [a, b] = run.horizontal ? [point.x, stub.x] : [point.y, stub.y];
				cuts.push([Math.min(a, b), Math.max(a, b)]);
			}
		}
		for (const other of others) {
			if (other.horizontal === run.horizontal && Math.abs(other.line - run.line) < sameLine) {
				cuts.push([other.low, other.high]);
			}
		}
		const crossings = borders.flatMap((box) => {
			const [near, far] = run.horizontal ? [box.y, box.y + box.height] : [box.x, box.x + box.width];
			return near < run.line && run.line < far
				? run.horizontal
					? [box.x, box.x + box.width]
					: [box.y, box.y + box.height]
				: [];
		});
		return without([run.low, run.high], cuts).flatMap(([low, high]) =>
			split([low, high], crossings).map(([a, b]) => ({ ...run, low: a, high: b })),
		);
	});
}

/** An interval, split at each of the points that lie inside it. */
function split(interval: [number, number], points: number[]): [number, number][] {
	const [low, high] = interval;
	const inside = points.filter((point) => low < point && point < high).sort((a, b) => a - b);
	return [low, ...inside].map((start, index): [number, number] => [start, inside[index] ?? high]);
}

/** What's left of an interval once the cuts are taken out of it. */
function without(interval: [number, number], cuts: [number, number][]): [number, number][] {
	let pieces = [interval];
	for (const [low, high] of cuts) {
		pieces = pieces.flatMap(([a, b]): [number, number][] =>
			high <= a || low >= b
				? [[a, b]]
				: [
						...(low > a ? [[a, low] as [number, number]] : []),
						...(high < b ? [[high, b] as [number, number]] : []),
					],
		);
	}
	return pieces.filter(([low, high]) => high > low);
}

function grown(box: Box, by: number): Box {
	return { x: box.x - by, y: box.y - by, width: box.width + 2 * by, height: box.height + 2 * by };
}

/** Whether two boxes overlap, more than along their borders. */
function overlaps(a: Box, b: Box): boolean {
	return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Below this, a line that only grazes a box's border doesn't pass through it. */
const graze = 1e-6;

/** Whether a horizontal or vertical segment passes through a box, inside its border. */
function crosses(box: Box, a: Point, b: Point): boolean {
	return (
		Math.min(a.x, b.x) < box.x + box.width - graze &&
		Math.max(a.x, b.x) > box.x + graze &&
		Math.min(a.y, b.y) < box.y + box.height - graze &&
		Math.max(a.y, b.y) > box.y + graze
	);
}

/** A box's four sides. */
function sidesOf(box: Box): Segment[] {
	const corners = [
		{ x: box.x, y: box.y },
		{ x: box.x + box.width, y: box.y },
		{ x: box.x + box.width, y: box.y + box.height },
		{ x: box.x, y: box.y + box.height },
	];
	return corners.map((corner, index): Segment => [corner, corners[(index + 1) % 4] ?? corner]);
}
