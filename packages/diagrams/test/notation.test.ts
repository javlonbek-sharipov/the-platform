import { describe, expect, test } from "vitest";
import { render } from "../src/index.ts";
import { plumbingModel, plumbingNotation } from "./support/plumbing.ts";

/** Renders a Diagram with a core that's given the plumbing Notation, in place of the engine's own. */
function renderPlumbing(diagram: unknown) {
	return render(diagram, { notations: [plumbingNotation] });
}

describe("a Notation defined only in the tests", () => {
	test("is one the core reads a Diagram in, once the core is given its definition", () => {
		const { diagnostics, scene, svg } = renderPlumbing(plumbingModel());

		expect(diagnostics).toEqual([]);
		expect(scene?.nodes).toEqual([]);
		expect(svg).toMatch(/^<svg /);
	});

	test("is unknown to a core that wasn't given it, which names the Notations it has", () => {
		expect(render(plumbingModel())).toEqual({
			diagnostics: [
				{
					severity: "error",
					rule: "unknown-notation",
					message:
						"The Diagram's Notation is `plumbing`, which this engine doesn't have. Its Notations are architecture.",
					pointer: "/notation",
				},
			],
		});
		expect(
			render({ ...plumbingModel(), notation: "wiring" }, { notations: [plumbingNotation] }),
		).toEqual({
			diagnostics: [
				{
					severity: "error",
					rule: "unknown-notation",
					message:
						"The Diagram's Notation is `wiring`, which this engine doesn't have. Its Notations are plumbing.",
					pointer: "/notation",
				},
			],
		});
	});

	test("has the Node Kinds its definition lists, and no others", () => {
		const boiler = (kind: string) =>
			plumbingModel({ members: ["boiler"], nodes: [{ id: "boiler", kind, title: "Boiler" }] });

		expect(renderPlumbing(boiler("tank")).diagnostics).toEqual([]);
		expect(renderPlumbing(boiler("service"))).toEqual({
			diagnostics: [
				{
					severity: "error",
					rule: "unknown-kind",
					message:
						"Node `boiler` has the Kind `service`, which the plumbing Notation doesn't have. Its Node Kinds are tank, pump and tap.",
					pointer: "/nodes/0/kind",
				},
			],
		});
	});
});
