import { expect, test } from "vitest";
import { architecture, domain, notations, render, schemaOf } from "../src/index.ts";
import { schemaChecker } from "./support/schema.ts";

test("the builder, core and schema carry local and explicit-context term Links in the SVG model", () => {
	const links = [
		{ term: "Invoice" },
		{ term: "Order", context: "ordering", label: "Order definition" },
	] as const;
	const diagram = domain({ title: "Billing" }, (d) => {
		d.group(
			{ id: "billing", kind: "context", title: "Billing", links: [{ term: "Invoice" }] },
			(billing) => {
				billing.node({ id: "invoice", kind: "aggregate", title: "Invoice", links });
			},
		);
	});
	const result = render(diagram);
	expect(result.diagnostics).toEqual([]);
	expect(result.svg).toContain(
		'"links":[{"term":"Invoice"},{"context":"ordering","label":"Order definition","term":"Order"}]',
	);
	expect(diagram.nodes[0]?.links).toEqual(links);
	expect(schemaChecker(schemaOf(notations)).errors(diagram)).toEqual([]);
	const architectureDiagram = architecture({ title: "Billing service" }, (d) => {
		d.node({
			id: "billing-api",
			kind: "service",
			title: "Billing API",
			links: [{ term: "Invoice", context: "billing" }],
		});
	});
	expect(render(architectureDiagram).diagnostics).toEqual([]);
});

test.each([
	[{ term: " " }, "/term", "model-shape"],
	[{ term: 7 }, "/term", "model-shape"],
	[{ term: "Invoice", context: "Billing" }, "/context", "id-format"],
	[{ term: "Invoice", context: "billing/orders" }, "/context", "id-format"],
	[{ term: "Invoice", context: 7 }, "/context", "model-shape"],
	[{ term: "Invoice", section: "x" }, "/section", "model-shape"],
	[{ id: "invoice", context: "billing" }, "/context", "model-shape"],
	[{ doc: "billing.md", context: "billing" }, "/context", "model-shape"],
	[{ term: "Invoice\u0007" }, "/term", "invalid-character"],
	[{ term: "Invoice", doc: "billing.md" }, "", "model-shape"],
])(
	"term Link validation and schema agree on the field that is invalid: %j",
	(link, suffix, rule) => {
		const diagram = architecture({ title: "Billing" }, (d) => {
			d.node({ id: "invoice", kind: "system", title: "Invoice", links: [link as never] });
		});
		const pointer = `/nodes/0/links/0${suffix}`;
		expect(render(diagram).diagnostics).toContainEqual(
			expect.objectContaining({ severity: "error", rule, pointer }),
		);
		expect(schemaChecker(schemaOf(notations)).pointers(diagram)).toContain(pointer);
	},
);
