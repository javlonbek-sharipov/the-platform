import type { ArchitectureNotation, DiagramOf } from "../../src/index.ts";

/**
 * An architecture Diagram with a label on every `every`th Edge, of a few
 * lengths, some with a Technology or a rate below it.
 */
export function labeled(
	diagram: DiagramOf<ArchitectureNotation>,
	every = 1,
): DiagramOf<ArchitectureNotation> {
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
