import billing from "../../docs/example-billing.diagram.ts";
import type { DiagramOf, Direction, DomainNotation } from "../../src/index.ts";

/** Both aggregate Node Kinds, all three Edge Kinds, Rows and a foreign event. */
export function aggregates(direction: Direction): DiagramOf<DomainNotation> {
	return { ...billing, direction };
}
