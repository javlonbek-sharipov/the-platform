/**
 * `<platform-diagram>`: a custom element that makes an engine-made SVG
 * explorable, in any page, without a framework. It never lays anything out
 * or routes it: it works from the SVG alone (ADR-0002).
 *
 * The SVG is given as an inline child, which the page shows before any script
 * runs. The element moves it onto its stage, in a shadow root, where the
 * page's styles don't reach it and the element's own don't leak out.
 */

import type { AtlasIndex } from "../atlas/types.ts";
import { Camera, huggingHeight, type View } from "./camera.ts";
import { Highlights, type HighlightTargets } from "./highlights.ts";
import { Navigation, type UrlResolver } from "./navigation.ts";
import { parts } from "./parts.ts";
import { Selection, type SelectionTarget } from "./selection.ts";
import type { Shown } from "./stage.ts";
import { styles } from "./styles.ts";
import { boundsOf, fetchSvg } from "./svg.ts";
import { SvgTransition, sameDiagram } from "./transitions.ts";

/**
 * The most a component gets high when the page gives it no height: most of
 * the window's, so that some of the page stays in reach around it.
 */
const tallest = "80vh";

export class PlatformDiagram extends HTMLElement {
	/** The host may turn motion off; `auto` always respects reduced motion. */
	get motion(): "auto" | "off" {
		return this.getAttribute("motion") === "off" ? "off" : "auto";
	}

	set motion(value: "auto" | "off") {
		this.setAttribute("motion", value);
	}

	/** Holds the SVG, clips it, and takes the reader's input. */
	readonly #stage = document.createElement("div");
	readonly #camera = new Camera();
	readonly #selection = new Selection();
	readonly #highlights = new Highlights();
	readonly #navigation = new Navigation((detail) => {
		this.dispatchEvent(
			new CustomEvent("diagram-navigate", { detail, bubbles: true, composed: true }),
		);
	});
	readonly #sizes = new ResizeObserver(([entry]) => {
		const size = entry?.contentBoxSize[0];
		if (size !== undefined) {
			this.#camera.resize({ width: size.inlineSize, height: size.blockSize });
		}
	});
	/** Takes each SVG that the page gives the element as a child, later than the first too. */
	readonly #children = new MutationObserver(() => this.#take());
	/** The children that couldn't be shown, which stay where they are, and aren't tried again. */
	readonly #refused = new WeakSet<SVGSVGElement>();
	#svg: SVGSVGElement | undefined;
	/** What the parts asked to be told of each SVG that's shown, and what to call when it no longer is. */
	readonly #shown = new Set<Shown>();
	readonly #hidden: (() => void)[] = [];
	/** Whether the element is in a page, where it shows its `src`. */
	#live = false;
	/** Stops the `src` on its way, when another takes its place or the element leaves the page. */
	#loading: AbortController | undefined;
	#transition: SvgTransition | undefined;
	readonly #reduced = matchMedia("(prefers-reduced-motion: reduce)");
	readonly #motionChanged = () => {
		if (this.motion === "off" || this.#reduced.matches) this.#transition?.finish();
	};

	static readonly observedAttributes = ["src", "motion"];

	/** The reader's persistent selection. Hover leaves it unchanged. */
	get selection(): SelectionTarget | undefined {
		return this.#selection.current;
	}

	get selectedNode(): string | undefined {
		return this.selection?.kind === "node" ? this.selection.id : undefined;
	}

	/** Selects a Node by id without moving keyboard focus. Unknown ids return false. */
	selectNode(id: string | undefined): boolean {
		return this.#selection.select(id === undefined ? undefined : { kind: "node", id });
	}

	/** Emphasizes exactly these Nodes and Edges until cleared, without changing selection. */
	setHighlight(targets: HighlightTargets | undefined): void {
		this.#highlights.set(targets);
	}

	/** Turns a Link or Diagram id into a URL included with `diagram-navigate`. Navigation stays with the host. */
	get resolveUrl(): UrlResolver | undefined {
		return this.#navigation.resolver;
	}

	set resolveUrl(value: UrlResolver | undefined) {
		this.#navigation.resolver = value;
	}

	/** Optional browser-safe Atlas metadata. Reassign after an index changes to refresh open details. */
	get atlasIndex(): AtlasIndex | undefined {
		return this.#navigation.index;
	}

	set atlasIndex(value: AtlasIndex | undefined) {
		this.#navigation.index = value;
	}

	constructor() {
		super();
		const root = this.attachShadow({ mode: "open" });
		root.adoptedStyleSheets = [styles];
		this.#stage.className = "stage";
		this.#stage.tabIndex = 0;
		root.append(this.#stage);
		this.#camera.watch((view) => this.#look(view));
		this.#selection.watch((target) => {
			this.dispatchEvent(
				new CustomEvent("diagram-select", {
					detail: target ?? null,
					bubbles: true,
					composed: true,
				}),
			);
		});
		for (const part of parts) {
			part.setUp({
				element: this.#stage,
				camera: this.#camera,
				selection: this.#selection,
				highlights: this.#highlights,
				navigation: this.#navigation,
				onShow: (listener) => this.#shown.add(listener),
			});
		}
	}

	connectedCallback(): void {
		this.#reduced.addEventListener("change", this.#motionChanged);
		if (!this.#take()) {
			// Back in a page, with the SVG it had on its stage when it left.
			this.#tell();
		}
		this.#children.observe(this, { childList: true });
		this.#sizes.observe(this.#stage);
		this.#live = true;
		void this.#load(this.getAttribute("src"));
	}

	disconnectedCallback(): void {
		this.#transition?.finish();
		this.#reduced.removeEventListener("change", this.#motionChanged);
		this.#live = false;
		this.#loading?.abort();
		this.#children.disconnect();
		this.#sizes.disconnect();
		this.#untell();
	}

	/**
	 * Moves the SVG that the page gave the element as a child onto the stage.
	 * It says whether there was one to show.
	 */
	#take(): boolean {
		const child = this.querySelector(":scope > svg");
		if (!(child instanceof SVGSVGElement) || this.#refused.has(child)) {
			return false;
		}
		try {
			this.#show(child);
		} catch (error) {
			this.#refused.add(child);
			this.#fail(`The Diagram given as an inline child can't be shown: ${reasonOf(error)}.`, error);
			return false;
		}
		// A page that's still being parsed may not have the whole SVG yet: an element
		// defined early is given its child while the child is still arriving. The
		// parser goes on filling the SVG on the stage, and the parts are told of it
		// again once it's whole, since some read what comes late, such as its style.
		const page = this.ownerDocument;
		if (page.readyState === "loading") {
			page.addEventListener(
				"DOMContentLoaded",
				() => {
					if (this.#svg === child && this.#live) {
						this.#untell();
						this.#tell();
					}
				},
				{ once: true },
			);
		}
		return true;
	}

	attributeChangedCallback(name: string, _before: string | null, value: string | null): void {
		if (name === "motion") {
			this.#motionChanged();
			return;
		}
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
		const same = this.#svg !== undefined && sameDiagram(this.#svg, svg);
		const transition: SvgTransition | undefined =
			this.#svg !== undefined && this.motion !== "off" && !this.#reduced.matches && same
				? new SvgTransition(this.#svg, svg, () => {
						if (this.#transition === transition) this.#transition = undefined;
					})
				: undefined;
		this.#transition?.finish();
		this.#transition = transition;
		svg.style.height = `min(${huggingHeight(bounds)}, ${tallest})`;
		this.#untell();
		this.#svg = svg;
		this.#stage.replaceChildren(svg);
		transition?.prepare();
		this.#camera.frame(bounds, same);
		this.#tell();
		transition?.play();
	}

	/** Tells the parts of the SVG on the stage. */
	#tell(): void {
		const svg = this.#svg;
		if (svg !== undefined) {
			for (const listener of this.#shown) {
				const hidden = listener(svg);
				if (hidden !== undefined) {
					this.#hidden.push(hidden);
				}
			}
		}
	}

	/** Tells the parts that the SVG they were told of is shown no longer. */
	#untell(): void {
		for (const hidden of this.#hidden.splice(0)) {
			hidden();
		}
	}

	/** Shows a view: the SVG fills the stage, and its `viewBox` is the part of the drawing in view. */
	#look({ x, y, width, height }: View): void {
		this.#svg?.setAttribute("viewBox", [x, y, width, height].join(" "));
	}
}

function reasonOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
