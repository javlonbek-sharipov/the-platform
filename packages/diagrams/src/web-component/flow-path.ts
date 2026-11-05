/** Culling an engine-made flow stroke against the camera, including its rounded corners and hops. */

import type { Box, Point } from "../core/scene.ts";

interface Piece {
	box: Box;
	arc?: { center: Point; radius: number };
}

/**
 * Read the geometry once. A bounds check rejects most Edges; testing its
 * individual runs also rejects a loop surrounding the view. Keep unfamiliar
 * SVG path commands conservatively, so a future SVG still shows its marks.
 */
export function flowInView(path: SVGPathElement): (view: Box) => boolean {
	const bounds = path.getBBox();
	const pieces = piecesOf(path.getAttribute("d") ?? "");
	return (view) => {
		// Half the 3 px stroke, rounded up, also covers SVG's coordinate rounding.
		const padded = { x: view.x - 2, y: view.y - 2, width: view.width + 4, height: view.height + 4 };
		return (
			intersection(bounds, padded) !== undefined &&
			(pieces === undefined || pieces.some((piece) => touches(piece, padded)))
		);
	};
}

/** The writer emits absolute M, L and circular quarter-turn A commands, with M starting each hop's piece. */
function piecesOf(data: string): Piece[] | undefined {
	const tokens = data.match(/[a-zA-Z]|-?\d+(?:\.\d+)?/g) ?? [];
	const pieces: Piece[] = [];
	let pen: Point | undefined;
	for (let at = 0; at < tokens.length; ) {
		const command = tokens[at++];
		const count = command === "M" || command === "L" ? 2 : command === "A" ? 7 : 0;
		if (count === 0) {
			return undefined;
		}
		const values = tokens.slice(at, at + count).map(Number);
		at += count;
		if (values.length !== count || values.some((value) => !Number.isFinite(value))) {
			return undefined;
		}
		const end = { x: values[count - 2] ?? 0, y: values[count - 1] ?? 0 };
		if (command !== "M") {
			if (pen === undefined) {
				return undefined;
			}
			const box = {
				x: Math.min(pen.x, end.x),
				y: Math.min(pen.y, end.y),
				width: Math.abs(end.x - pen.x),
				height: Math.abs(end.y - pen.y),
			};
			if (command === "L") {
				pieces.push({ box });
			} else {
				const [rx = 0, ry, rotation, large, sweep] = values;
				if (
					rx !== ry ||
					rotation !== 0 ||
					large !== 0 ||
					Math.abs(box.width - rx) > 0.02 ||
					Math.abs(box.height - rx) > 0.02
				) {
					return undefined;
				}
				const clockwise = (end.x - pen.x) * (end.y - pen.y) > 0;
				const center =
					clockwise === (sweep === 1) ? { x: pen.x, y: end.y } : { x: end.x, y: pen.y };
				pieces.push({ box, arc: { center, radius: rx } });
			}
		}
		pen = end;
	}
	return pieces;
}

function intersection(a: Box, b: Box): Box | undefined {
	const x = Math.max(a.x, b.x);
	const y = Math.max(a.y, b.y);
	const right = Math.min(a.x + a.width, b.x + b.width);
	const bottom = Math.min(a.y + a.height, b.y + b.height);
	return x > right || y > bottom ? undefined : { x, y, width: right - x, height: bottom - y };
}

/** A quarter-circle touches a rectangle when its radius lies between the nearest and farthest points. */
function touches({ box, arc }: Piece, view: Box): boolean {
	const clipped = intersection(box, view);
	if (clipped === undefined || arc === undefined) {
		return clipped !== undefined;
	}
	const { center, radius } = arc;
	const left = clipped.x - center.x;
	const right = left + clipped.width;
	const top = clipped.y - center.y;
	const bottom = top + clipped.height;
	const nearX = Math.max(left, Math.min(0, right));
	const nearY = Math.max(top, Math.min(0, bottom));
	const farX = Math.max(Math.abs(left), Math.abs(right));
	const farY = Math.max(Math.abs(top), Math.abs(bottom));
	return (
		nearX * nearX + nearY * nearY <= radius * radius && farX * farX + farY * farY >= radius * radius
	);
}
