/** Selection shared by the drawing, keyboard, accessible lists and host page. */

import type { AnyDiagram } from "../authoring/model.ts";

export interface SelectionTarget {
	readonly kind: "node" | "edge";
	readonly id: string;
}

export type DiagramSelectionEvent = CustomEvent<SelectionTarget | null>;

/** Selection holds ids, so a new SVG of the same Diagram can keep it. */
export class Selection {
	#current: SelectionTarget | undefined;
	#diagram: AnyDiagram | undefined;
	readonly #listeners = new Set<(target: SelectionTarget | undefined) => void>();

	get current(): SelectionTarget | undefined {
		return this.#current;
	}

	/** Reconciles the selection with the Diagram now on the stage. */
	show(diagram: AnyDiagram): void {
		this.#diagram = diagram;
		if (this.#current !== undefined && !this.#has(this.#current)) {
			this.select(undefined);
		}
	}

	/** Selects a drawn Node or Edge; an unknown id leaves the selection alone. */
	select(target: SelectionTarget | undefined): boolean {
		if (target !== undefined && !this.#has(target)) {
			return false;
		}
		if (target?.kind === this.#current?.kind && target?.id === this.#current?.id) {
			return true;
		}
		this.#current = target === undefined ? undefined : Object.freeze({ ...target });
		for (const listener of this.#listeners) {
			listener(this.#current);
		}
		return true;
	}

	/** Watches changes, until the returned function is called. */
	watch(listener: (target: SelectionTarget | undefined) => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	#has(target: SelectionTarget): boolean {
		return (
			(target.kind === "node" ? this.#diagram?.nodes : this.#diagram?.edges)?.some(
				({ id }) => id === target.id,
			) === true
		);
	}
}
