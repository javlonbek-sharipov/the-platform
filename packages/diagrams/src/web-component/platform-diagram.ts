/**
 * `<platform-diagram>`: a custom element that makes an engine-made SVG
 * explorable, in any page, without a framework. It never lays anything out
 * or routes it: it works from the SVG alone (ADR-0002).
 *
 * The SVG is given as an inline child, which the page shows before any script
 * runs. The element moves it onto its stage, in a shadow root, where the
 * page's styles don't reach it and the element's own don't leak out.
 */

import { Camera, huggingHeight, type View } from "./camera.ts";
import { parts } from "./parts.ts";
import { styles } from "./styles.ts";
import { boundsOf, fetchSvg } from "./svg.ts";

/**
 * The most a component gets high when the page gives it no height: most of
 * the window's, so that some of the page stays in reach around it.
 */
const tallest = "80vh";

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
	/** Whether the element is in a page, where it shows its `src`. */
	#live = false;
	/** Stops the `src` on its way, when another takes its place or the element leaves the page. */
	#loading: AbortController | undefined;

	static readonly observedAttributes = ["src"];

	constructor() {
		super();
		const root = this.attachShadow({ mode: "open" });
		root.adoptedStyleSheets = [styles];
		this.#stage.className = "stage";
		this.#stage.tabIndex = 0;
		root.append(this.#stage);
		this.#camera.watch((view) => this.#look(view));
		for (const part of parts) {
			part.setUp({ element: this.#stage, camera: this.#camera });
		}
	}

	connectedCallback(): void {
		const child = this.querySelector(":scope > svg");
		if (child instanceof SVGSVGElement) {
			try {
				this.#show(child);
			} catch (error) {
				this.#fail(
					`The Diagram given as an inline child can't be shown: ${reasonOf(error)}.`,
					error,
				);
			}
		}
		this.#sizes.observe(this.#stage);
		this.#live = true;
		void this.#load(this.getAttribute("src"));
	}

	disconnectedCallback(): void {
		this.#live = false;
		this.#loading?.abort();
		this.#sizes.disconnect();
	}

	attributeChangedCallback(_name: string, _before: string | null, value: string | null): void {
		// Before the element is in a page, `connectedCallback` is still to come, and loads the `src`.
		if (this.#live) {
			void this.#load(value);
		}
	}

	/** Fetches the SVG at a URL, and shows it. A later call takes over from one still on its way. */
	async #load(source: string | null): Promise<void> {
		this.#loading?.abort();
		if (source === null) {
			return;
		}
		const loading = new AbortController();
		this.#loading = loading;
		try {
			const svg = await fetchSvg(source, loading.signal);
			if (loading.signal.aborted) {
				return;
			}
			this.#show(svg);
		} catch (error) {
			if (!loading.signal.aborted) {
				this.#fail(`The Diagram at ${source} can't be shown: ${reasonOf(error)}.`, error);
			}
			return;
		}
		this.dispatchEvent(new Event("load"));
	}

	/** Tells the page that a Diagram can't be shown. Whatever the stage shows stays. */
	#fail(message: string, error: unknown): void {
		this.dispatchEvent(new ErrorEvent("error", { message, error }));
	}

	/** Puts a Diagram's SVG on the stage, in place of the one before it. */
	#show(svg: SVGSVGElement): void {
		const bounds = boundsOf(svg);
		svg.style.height = `min(${huggingHeight(bounds)}, ${tallest})`;
		this.#svg = svg;
		this.#stage.replaceChildren(svg);
		this.#camera.frame(bounds);
	}

	/** Shows a view: the SVG fills the stage, and its `viewBox` is the part of the drawing in view. */
	#look({ x, y, width, height }: View): void {
		this.#svg?.setAttribute("viewBox", [x, y, width, height].join(" "));
	}
}

function reasonOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
