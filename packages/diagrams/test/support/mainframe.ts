/**
 * The architecture Notation with one Kind added to its definition, as a
 * ticket that adds a Kind would change it: a `mainframe`, which the engine's
 * own definition doesn't have. Whatever knows the new Kind read it from the
 * definition.
 */

import { architectureNotation, type Notation } from "../../src/index.ts";

export const withMainframe = {
	...architectureNotation,
	nodeKinds: {
		...architectureNotation.nodeKinds,
		mainframe: {
			width: 208,
			height: 64,
			outline: "heavy",
			badge: "M 3 2 H 13 V 14 H 3 Z M 6 5 H 10",
			hue: "compute",
		},
	},
} as const satisfies Notation;
