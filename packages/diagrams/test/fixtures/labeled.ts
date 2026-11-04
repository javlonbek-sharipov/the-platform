import type { Diagram } from "../../src/index.ts";

/**
 * A Diagram with a label on every `every`th Edge, of a few lengths, some with
 * a Technology or a rate below it.
 */
export function labeled(diagram: Diagram, every = 1): Diagram {
	const phrases = ["Reads", "Places orders", "Publishes events", "Syncs stock", "Charges cards"];
	return {
		...diagram,
		edges: diagram.edges.map((edge, index) =>
			index % every !== 0
				? edge
				: {
						...edge,
						label: phrases[(index / every) % phrases.length] ?? "Reads",
						...(index % 3 === 0 ? { technology: "grpc" } : {}),
						...(index % 4 === 1 ? { rate: "2k/s" } : {}),
					},
		),
	};
}
