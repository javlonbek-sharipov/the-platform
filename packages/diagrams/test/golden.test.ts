import { describe, expect, test } from "vitest";
import everyKind from "./fixtures/every-kind.ts";
import externalStatusCallout from "./fixtures/external-status-callout.ts";
import { renderWithFont } from "./support/fonts.ts";
import { expectGolden } from "./support/golden.ts";

/** Golden files change only through `pnpm golden:update`, so every visual change shows in review. */
const fixtures = { "every-kind": everyKind, "external-status-callout": externalStatusCallout };

describe("golden files", () => {
	for (const [name, diagram] of Object.entries(fixtures)) {
		test(`${name} renders exactly its golden SVG`, () => {
			const { svg, diagnostics } = renderWithFont(diagram);
			expect(diagnostics).toEqual([]);
			expectGolden(name, svg ?? "");
		});
	}
});
