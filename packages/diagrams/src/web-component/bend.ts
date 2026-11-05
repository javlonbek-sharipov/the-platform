/** Bend an old SVG route by blending the displacements of its two ends. */
import type { Point } from "../core/scene.ts";

interface Command {
	name: string;
	values: number[];
	point?: Point;
}

/** The SVG writer's absolute M/L/A/H/V/Z grammar, read without rerouting. */
function commandsOf(data: string): Command[] {
	const tokens = data.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/g) ?? [];
	const commands: Command[] = [];
	let pen: Point = { x: 0, y: 0 };
	for (let at = 0; at < tokens.length; ) {
		const name = tokens[at++] ?? "";
		const count =
			name === "M" || name === "L" ? 2 : name === "A" ? 7 : name === "H" || name === "V" ? 1 : 0;
		if (count === 0) {
			if (name !== "Z") return [];
			commands.push({ name, values: [] });
			continue;
		}
		const values = tokens.slice(at, at + count).map(Number);
		at += count;
		if (values.length !== count || values.some((n) => !Number.isFinite(n))) return [];
		if (name === "H" || name === "V") {
			pen =
				name === "H" ? { x: values[0] ?? pen.x, y: pen.y } : { x: pen.x, y: values[0] ?? pen.y };
			commands.push({ name: "L", values: [pen.x, pen.y], point: pen });
		} else {
			pen = { x: values[count - 2] ?? 0, y: values[count - 1] ?? 0 };
			commands.push({ name, values, point: pen });
		}
	}
	return commands;
}

/** Fractions run from target to source, as the writer's stroke does. */
function alongRoute(path: SVGPathElement): (point: Point) => number {
	const points = commandsOf(path.getAttribute("d") ?? "").flatMap(({ point }) =>
		point === undefined ? [] : [point],
	);
	const runs: { from: Point; to: Point; start: number; length: number }[] = [];
	let total = 0;
	for (let i = 1; i < points.length; i++) {
		const from = points[i - 1];
		const to = points[i];
		if (from === undefined || to === undefined) continue;
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const length = Math.sqrt(dx * dx + dy * dy);
		runs.push({ from, to, start: total, length });
		total += length;
	}
	return (point) => {
		let best = Number.POSITIVE_INFINITY;
		let fraction = 0.5;
		for (const { from, to, start, length } of runs) {
			if (length === 0) continue;
			const dx = to.x - from.x;
			const dy = to.y - from.y;
			const along = Math.max(
				0,
				Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / (length * length)),
			);
			const x = point.x - from.x - dx * along;
			const y = point.y - from.y - dy * along;
			const distance = x * x + y * y;
			if (distance < best) {
				best = distance;
				fraction = total === 0 ? 0.5 : (start + length * along) / total;
			}
		}
		return fraction;
	};
}

export interface BendAnimation {
	element: SVGElement;
	frames: Keyframe[];
}

/** Includes casing, body, arrowheads, chevrons, badges, labels and role tags. */
export function bendEdge(
	group: SVGGElement,
	companions: SVGGraphicsElement[],
	from: Point,
	to: Point,
): BendAnimation[] {
	const route = group.querySelector("path");
	if (route === null) return [];
	const weight = alongRoute(route);
	const displacement = (point: Point) => {
		const part = weight(point);
		return { x: to.x + (from.x - to.x) * part, y: to.y + (from.y - to.y) * part };
	};
	const animations: BendAnimation[] = [];
	for (const element of group.querySelectorAll("path")) {
		const commands = commandsOf(element.getAttribute("d") ?? "");
		if (commands.length === 0) continue;
		const data = (bent: boolean) =>
			commands
				.map(({ name, values, point }) => {
					if (point === undefined) return name;
					const delta = bent ? displacement(point) : { x: 0, y: 0 };
					return `${name} ${[...values.slice(0, -2), point.x + delta.x, point.y + delta.y].join(" ")}`;
				})
				.join(" ");
		animations.push({
			element,
			frames: [{ d: `path("${data(false)}")` }, { d: `path("${data(true)}")` }],
		});
	}
	const translate = (element: SVGElement, point: Point) => {
		const delta = displacement(point);
		const base = element.style.transform === "none" ? "" : element.style.transform;
		animations.push({
			element,
			frames: [
				{ transform: `${base} translate(0px, 0px)` },
				{ transform: `${base} translate(${delta.x}px, ${delta.y}px)` },
			],
		});
	};
	for (const element of group.querySelectorAll("circle"))
		translate(element, { x: element.cx.baseVal.value, y: element.cy.baseVal.value });
	for (const element of companions) {
		const box = element.getBBox();
		translate(element, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
	}
	return animations;
}
