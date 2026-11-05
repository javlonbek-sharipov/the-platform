/**
 * `<platform-diagram>`: a custom element that makes an engine-made SVG
 * explorable, in any page, without a framework. It never lays anything out
 * or routes it: it works from the SVG alone (ADR-0002).
 *
 * The SVG is given as an inline child, which the page shows before any script
 * runs. The element moves it onto its stage, in a shadow root, where the
 * page's styles don't reach it and the element's own don't leak out.
 */

import { Camera, type View } from "./camera.ts";
import { styles } from "./styles.ts";

export class PlatformDiagram extends HTMLElement {
	/** Holds the SVG, clips it, and takes the reader's input. */
	readonly #stage = document.createElement("div");
	readonly #camera = new Camera();
	readonly #sizes = new ResizeObserver(([entry]) => {
		const size = entry?.contentBoxSize[0];
		if (size !== undefined) {
			this.#camera.resize({ width: size.inlineSize, height: size.blockSize });
		}
	});
	#svg: SVGSVGElement | undefined;

	constructor() {
		super();
		const root = this.attachShadow({ mode: "open" });
		root.adoptedStyleSheets = [styles];
		this.#stage.className = "stage";
		root.append(this.#stage);
		this.#camera.watch((view) => this.#look(view));
	}

	connectedCallback(): void {
		const child = this.querySelector(":scope > svg");
		if (child instanceof SVGSVGElement) {
			this.#show(child);
		}
		this.#sizes.observe(this.#stage);
	}

	disconnectedCallback(): void {
		this.#sizes.disconnect();
	}

	/** Puts a Diagram's SVG on the stage, in place of the one before it. */
	#show(svg: SVGSVGElement): void {
		const { x, y, width, height } = svg.viewBox.baseVal;
		this.#svg = svg;
		this.#stage.replaceChildren(svg);
		this.#camera.frame({ x, y, width, height });
	}

	/** Shows a view: the SVG fills the stage, and its `viewBox` is the part of the drawing in view. */
	#look({ x, y, width, height }: View): void {
		this.#svg?.setAttribute("viewBox", [x, y, width, height].join(" "));
	}
}
