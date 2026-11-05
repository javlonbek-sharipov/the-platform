/** Navigation intents belong to the host page; the component never changes its location. */

import type { AtlasIndex } from "../atlas/types.ts";
import { type AnyDiagram, type Link, namespaceOf } from "../authoring/model.ts";
import { notations } from "../notations/notations.ts";

/** A Link, or a Diagram's Atlas id for drill-down and other-Diagram actions. */
export type NavigationTarget = Link | string;

/** Return undefined when the host has no URL for this target. Called when an action is activated. */
export type UrlResolver = (target: NavigationTarget) => string | undefined;

export interface NavigationSource {
	readonly diagram?: string;
	readonly kind: "node" | "group";
	readonly id: string;
}

export interface NavigationDetail {
	readonly target: NavigationTarget;
	readonly source: NavigationSource;
	readonly url?: string;
}

export type DiagramNavigationEvent = CustomEvent<NavigationDetail>;

/** Shared by the host-facing element and the parts offering navigation controls. */
export class Navigation {
	resolver: UrlResolver | undefined;
	#index: AtlasIndex | undefined;
	readonly #listeners = new Set<() => void>();
	readonly #emit: (detail: NavigationDetail) => void;

	constructor(emit: (detail: NavigationDetail) => void) {
		this.#emit = emit;
	}

	get index(): AtlasIndex | undefined {
		return this.#index;
	}

	set index(value: AtlasIndex | undefined) {
		this.#index = value;
		for (const listener of this.#listeners) listener();
	}

	watch(listener: () => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	/** Index metadata when present, otherwise the SVG model's namespace semantics. */
	contextOf(model: AnyDiagram, id: string): string | undefined {
		const notation = notations.find(({ name }) => name === model.notation);
		return (
			this.index?.ids[id]?.context ??
			(notation === undefined ? undefined : namespaceOf(model, id, notation))
		);
	}

	request(target: NavigationTarget, source: NavigationSource): void {
		const url = this.resolver?.(target);
		this.#emit({ target, source, ...(url === undefined ? {} : { url }) });
	}
}
