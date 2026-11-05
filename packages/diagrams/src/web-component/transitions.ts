/** A replacement drawing keeps identity while its geometry glides into place. */
import type { Box, Point } from "../core/scene.ts";
import { type BendAnimation, bendEdge } from "./bend.ts";
import { retainFontFaces } from "./font-faces.ts";
import { boundsOf, modelOf } from "./svg.ts";

const glide = 360;
const crossFade = 140;
const namespace = "http://www.w3.org/2000/svg";

/** Whether both SVGs name one Atlas Diagram. An absent id never aliases another drawing. */
export function sameDiagram(before: SVGSVGElement, after: SVGSVGElement): boolean {
	const first = modelOf(before);
	const next = modelOf(after);
	return first?.id !== undefined && first.id === next?.id && first.notation === next.notation;
}

interface ObjectPosition {
	element: SVGGElement;
	box: Box;
}

/**
 * Capture before the old drawing is detached. Preparation transplants the
 * actual Nodes and Groups; parts then bind once to the new model's geometry.
 */
export class SvgTransition {
	readonly #before: SVGSVGElement;
	readonly #after: SVGSVGElement;
	readonly #releaseFonts: () => void;
	readonly #done: () => void;
	readonly #positions = new Map<string, ObjectPosition>();
	readonly #moves: { element: SVGGElement; x: number; y: number }[] = [];
	readonly #fades: { wrapper: SVGElement; incoming: boolean; delay: number; duration: number }[] =
		[];
	readonly #animations: Animation[] = [];
	readonly #bends: BendAnimation[] = [];
	#started: CSSNumberish | null = null;
	#finished = false;

	constructor(before: SVGSVGElement, after: SVGSVGElement, done: () => void) {
		this.#before = before;
		this.#after = after;
		this.#releaseFonts = retainFontFaces(before);
		this.#done = done;
		const matrix = before.getScreenCTM()?.inverse();
		for (const element of before.querySelectorAll<SVGGElement>("[data-node], [data-group]")) {
			const box = element.getBBox();
			const screen = element.getScreenCTM();
			const point =
				matrix === undefined || screen === null
					? box
					: new DOMPoint(box.x, box.y).matrixTransform(matrix.multiply(screen));
			this.#positions.set(element.dataset.node ?? element.dataset.group ?? "", {
				element,
				box: { x: point.x, y: point.y, width: box.width, height: box.height },
			});
		}
	}

	/** Called while the new SVG is attached, before its parts read the drawing. */
	prepare(): void {
		const before = this.#before;
		const after = this.#after;
		const bounds = boundsOf(after);
		const deltas = new Map<string, Point>();
		for (const next of after.querySelectorAll<SVGGElement>("[data-node], [data-group]")) {
			const id = next.dataset.node ?? next.dataset.group ?? "";
			const previous = this.#positions.get(id);
			if (previous === undefined) {
				this.#fade(next, true);
				continue;
			}
			const box = next.getBBox();
			const old = previous.element;
			for (const attribute of [...old.attributes]) old.removeAttribute(attribute.name);
			for (const attribute of next.attributes) old.setAttribute(attribute.name, attribute.value);
			old.replaceChildren(...next.childNodes);
			next.replaceWith(old);
			this.#moves.push({ element: old, x: previous.box.x - box.x, y: previous.box.y - box.y });
			deltas.set(id, { x: box.x - previous.box.x, y: box.y - previous.box.y });
			this.#positions.delete(id);
		}
		for (const { element } of this.#positions.values()) this.#fade(element, false);
		const oldEdges = [...before.querySelectorAll<SVGGElement>("[data-edge]")];
		const oldIds = new Set(oldEdges.map((edge) => edge.dataset.edge));
		const newIds = new Set(
			[...after.querySelectorAll<SVGGElement>("[data-edge]")].map((edge) => edge.dataset.edge),
		);
		for (const edge of oldEdges) {
			const companions = [
				...before.querySelectorAll<SVGGraphicsElement>("[data-edge-label], [data-edge-role]"),
			].filter((part) => (part.dataset.edgeLabel ?? part.dataset.edgeRole) === edge.dataset.edge);
			this.#bends.push(
				...bendEdge(
					edge,
					companions,
					deltas.get(edge.dataset.from ?? "") ?? { x: 0, y: 0 },
					deltas.get(edge.dataset.to ?? "") ?? { x: 0, y: 0 },
				),
			);
			if (!newIds.has(edge.dataset.edge)) {
				this.#fade(edge, false);
				for (const part of companions) this.#fade(part, false);
			}
		}
		for (const part of after.querySelectorAll<SVGElement>(
			"[data-edge], [data-edge-label], [data-edge-role], [data-from]:not([data-edge])",
		)) {
			const retained = oldIds.has(
				part.dataset.edge ?? part.dataset.edgeLabel ?? part.dataset.edgeRole,
			);
			this.#fade(part, true, retained ? glide : 0, retained ? crossFade : glide);
		}
		// The old SVG retains its own scoped styles for retiring parts. Its
		// nested viewport is an identity map in the new drawing's user units.
		before.querySelector(":scope > rect")?.remove();
		for (const element of before.querySelectorAll("[data-flow]")) element.remove();
		for (const element of before.querySelectorAll("*")) {
			for (const attribute of [...element.attributes]) {
				if (attribute.name.startsWith("data-")) {
					element.setAttribute(attribute.name.replace("data-", "data-retired-"), attribute.value);
					element.removeAttribute(attribute.name);
				}
			}
		}
		for (const style of before.querySelectorAll("style"))
			style.textContent = style.textContent?.replaceAll("[data-", "[data-retired-") ?? "";
		before.removeAttribute("style");
		for (const key of ["x", "y", "width", "height"] as const)
			before.setAttribute(key, String(bounds[key]));
		before.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
		before.setAttribute("aria-hidden", "true");
		before.style.pointerEvents = "none";
		let layer: Element | null = after.querySelector("[data-node]");
		while (layer !== null && layer.parentNode !== after)
			layer = layer.parentNode instanceof Element ? layer.parentNode : null;
		after.insertBefore(before, layer);
		this.#fades.push({ wrapper: before, incoming: false, delay: glide, duration: crossFade });
	}

	/** Parts are now bound. Fade wrappers multiply their ordinary highlight opacity. */
	play(): void {
		this.#started = document.timeline.currentTime;
		for (const { element, frames } of this.#bends) this.#animate(element, frames);
		for (const { element, x, y } of this.#moves) {
			if (x !== 0 || y !== 0)
				this.#animate(element, [
					{ transform: `translate(${x}px, ${y}px)` },
					{ transform: "translate(0px, 0px)" },
				]);
		}
		for (const { wrapper, incoming, delay, duration } of this.#fades)
			this.#animate(
				wrapper,
				[{ opacity: incoming ? 0 : 1 }, { opacity: incoming ? 1 : 0 }],
				delay,
				duration,
			);
		if (this.#animations.length === 0) this.finish();
	}

	/** Motion-off, redraw and disconnect all settle to exactly the new drawing. */
	finish(): void {
		if (this.#finished) return;
		this.#finished = true;
		for (const animation of this.#animations) animation.cancel();
		for (const { wrapper, incoming } of this.#fades) {
			if (incoming) wrapper.replaceWith(...wrapper.childNodes);
		}
		this.#before.remove();
		this.#releaseFonts();
		this.#done();
	}

	#fade(element: SVGElement, incoming: boolean, delay = 0, duration = glide): void {
		const wrapper = document.createElementNS(namespace, "g");
		element.replaceWith(wrapper);
		wrapper.append(element);
		this.#fades.push({ wrapper, incoming, delay, duration });
	}

	#animate(element: SVGElement, frames: Keyframe[], delay = 0, duration = glide): Animation {
		const animation = element.animate(frames, {
			duration,
			delay,
			easing: "ease-in-out",
			fill: "both",
		});
		animation.startTime = this.#started;
		this.#animations.push(animation);
		animation.onfinish = () => {
			if (this.#animations.every((animation) => animation.playState === "finished")) this.finish();
		};
		return animation;
	}
}
