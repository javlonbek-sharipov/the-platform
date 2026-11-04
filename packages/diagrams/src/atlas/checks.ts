/** The checks that span Diagrams: every Link in the Atlas resolves. */

import type { Declarations } from "../authoring/declarations.ts";
import type { Diagram } from "../authoring/model.ts";
import { type AtlasMessage, located } from "./messages.ts";

/** A Diagram that passed validation, with where its module declared each thing. */
export interface CheckedDiagram {
	module: string;
	model: Diagram;
	declarations: Declarations;
}

/** Every Link must point at an id that some Diagram draws. */
export function checkLinks(diagrams: CheckedDiagram[]): AtlasMessage[] {
	const drawn = new Set(diagrams.flatMap(({ model }) => model.nodes.map((node) => node.id)));
	return diagrams.flatMap(({ module, model, declarations }) =>
		model.nodes.flatMap((node, index) =>
			(node.links ?? []).flatMap((link, linkIndex) =>
				link.id === undefined || drawn.has(link.id)
					? []
					: [
							located(module, declarations, {
								severity: "error",
								rule: "broken-link",
								message: `Node \`${node.id}\` has a Link to \`${link.id}\`, which no Diagram in the Atlas draws.`,
								pointer: `/nodes/${index}/links/${linkIndex}`,
							}),
						],
			),
		),
	);
}
