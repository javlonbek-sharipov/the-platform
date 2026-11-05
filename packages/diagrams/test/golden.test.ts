import { describe, expect, test } from "vitest";
import { contextMap } from "./fixtures/context-map.ts";
import { crowded } from "./fixtures/crowded.ts";
import edges from "./fixtures/edges.ts";
import everyKind from "./fixtures/every-kind.ts";
import externalStatusCallout from "./fixtures/external-status-callout.ts";
import technologies from "./fixtures/technologies.ts";
import { renderWithFont } from "./support/fonts.ts";
import { expectGolden } from "./support/golden.ts";

/** Golden files change only through `pnpm golden:update`, so every visual change shows in review. */
const fixtures = {
	"every-kind": everyKind,
	"external-status-callout": externalStatusCallout,
	technologies,
	crowded: crowded(),
	// Both Edge Kinds, junctions, and Edges that cross between zones and between regions.
	edges,
	// The domain Notation's context map: an Edge of each Kind, with every role.
	"context-map": contextMap("right"),
};

describe("golden files", () => {
	for (const [name, diagram] of Object.entries(fixtures)) {
		test(`${name} renders exactly its golden SVG`, () => {
			const { svg, diagnostics } = renderWithFont(diagram);
			expect(diagnostics).toEqual([]);
			expectGolden(name, svg ?? "");
		});
	}
});
