/** Explicit drawing emphasis, separate from selection and temporary hover. */

export interface HighlightTargets {
	readonly nodes?: readonly string[];
	readonly edges?: readonly string[];
}

export interface Highlight {
	readonly nodes: ReadonlySet<string>;
	readonly edges: ReadonlySet<string>;
}

/** A part such as a Walkthrough may take emphasis, then give it back to ordinary focus. */
export class Highlights {
	#current: Highlight | undefined;
	readonly #listeners = new Set<() => void>();

	get current(): Highlight | undefined {
		return this.#current;
	}

	set(targets: HighlightTargets | undefined): void {
		this.#current =
			targets === undefined
				? undefined
				: {
						nodes: new Set(targets.nodes),
						edges: new Set(targets.edges),
					};
		for (const listener of this.#listeners) {
			listener();
		}
	}

	watch(listener: () => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}
}
