import { expect, test } from "vitest";
import { architecture, domain, render, type Step } from "../src/index.ts";
import { schemaErrors, schemaPointers } from "./support/schema.ts";

test("a Walkthrough keeps ordered Edge, back, parallel and Node Steps in the SVG's model", () => {
	const diagram = architecture({ title: "Checkout" }, (d) => {
		const api = d.node({ id: "api", kind: "service", title: "API" });
		const db = d.node({ id: "db", kind: "database", title: "Database" });
		const save = d.edge(api, db, { kind: "call", id: "save" });
		const notify = d.edge(db, api, { kind: "message", id: "notify" });
		d.walkthrough({
			id: "checkout",
			title: "Place an order",
			steps: [
				{ edges: [save], note: "Save <order> & wait." },
				{ edges: [{ edge: save, back: true }], note: "Return the result." },
				{ edges: ["save", notify] },
				{ node: api, note: "Order placed." },
			],
		});
	});
	const expected = [
		{
			id: "checkout",
			title: "Place an order",
			steps: [
				{ edges: ["save"], note: "Save <order> & wait." },
				{ edges: [{ edge: "save", back: true }], note: "Return the result." },
				{ edges: ["save", "notify"] },
				{ node: "api", note: "Order placed." },
			],
		},
	];
	expect(diagram.walkthroughs).toEqual(expected);
	expect(schemaErrors(diagram)).toEqual([]);
	const result = render(diagram);
	expect(result.diagnostics).toEqual([]);
	expect(render(JSON.parse(JSON.stringify(diagram))).svg).toBe(result.svg);
	const metadata = result.svg
		?.match(/<metadata>(.*?)<\/metadata>/)?.[1]
		?.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&amp;", "&");
	expect(JSON.parse(metadata ?? "{}").walkthroughs).toEqual(expected);
	const without = render({ ...diagram, walkthroughs: [] }).svg;
	expect(result.svg?.replace(/<metadata>.*?<\/metadata>/, "")).toBe(
		without?.replace(/<metadata>.*?<\/metadata>/, ""),
	);
});

test.each([
	[null, "", "model-shape"],
	[{ id: "explain", title: "Explain", steps: [] }, "/steps", "model-shape"],
	[{ id: "explain", title: " ", steps: [{ node: "api" }] }, "/title", "model-shape"],
	[{ id: "Explain", title: "Explain", steps: [{ node: "api" }] }, "/id", "id-format"],
	[{ id: "explain", title: "Explain", steps: [null] }, "/steps/0", "model-shape"],
	[{ id: "explain", title: "Explain", steps: [{}] }, "/steps/0", "model-shape"],
	[
		{ id: "explain", title: "Explain", steps: [{ node: "api", edges: ["read"] }] },
		"/steps/0",
		"model-shape",
	],
	[{ id: "explain", title: "Explain", steps: [{ edges: [] }] }, "/steps/0/edges", "model-shape"],
	[
		{ id: "explain", title: "Explain", steps: [{ edges: [{ edge: "read", back: "yes" }] }] },
		"/steps/0/edges/0/back",
		"model-shape",
	],
	[
		{ id: "explain", title: "Explain", steps: [{ edges: [{ edge: "read", bakc: true }] }] },
		"/steps/0/edges/0/bakc",
		"model-shape",
	],
	[{ id: "explain", title: "Explain", steps: [{ node: "API" }] }, "/steps/0/node", "id-format"],
	[
		{ id: "explain", title: "Explain", steps: [{ edges: ["READ"] }] },
		"/steps/0/edges/0",
		"id-format",
	],
	[
		{ id: "explain", title: "Explain", steps: [{ node: "api", note: 7 }] },
		"/steps/0/note",
		"model-shape",
	],
] as const)(
	"generated JSON and schema reject an invalid Walkthrough: %j",
	(walkthrough, pointer, rule) => {
		const diagram = architecture({ title: "Validation" }, (d) => {
			d.node({ id: "api", kind: "service", title: "API" });
			d.edge("api", "api", { kind: "call", id: "read" });
		});
		const input = { ...diagram, walkthroughs: [walkthrough] };
		const at = `/walkthroughs/0${pointer}`;
		expect(render(input).diagnostics).toContainEqual(
			expect.objectContaining({ rule, pointer: at }),
		);
		expect(schemaPointers(input)).toContain(at);
		expect(render(input).svg).toBeUndefined();
	},
);

test("Walkthrough ids are unique among Walkthroughs, separately from Node and Edge ids", () => {
	const diagram = architecture({ title: "Ids" }, (d) => {
		d.node({ id: "explain", kind: "service", title: "Explain" });
		d.walkthrough({ id: "explain", title: "Explain", steps: [{ node: "explain" }] });
	});
	expect(render(diagram).diagnostics).toEqual([]);
	const first = diagram.walkthroughs[0];
	if (first === undefined) throw new Error("Walkthrough missing");
	diagram.walkthroughs.push(structuredClone(first));
	expect(render(diagram).diagnostics).toEqual([
		expect.objectContaining({
			rule: "duplicate-id",
			pointer: "/walkthroughs/1/id",
		}),
	]);
});

test.each(["title", "note"] as const)(
	"a Walkthrough's %s must be text an SVG can hold",
	(field) => {
		const diagram = architecture({ title: "Text" }, (d) => {
			d.node({ id: "api", kind: "service", title: "API" });
			d.walkthrough({ id: "explain", title: "Explain", steps: [{ node: "api" }] });
		});
		const walkthrough = diagram.walkthroughs[0];
		const step = walkthrough?.steps[0];
		if (walkthrough === undefined || step === undefined) throw new Error("Step missing");
		if (field === "title") walkthrough.title = "Bad\u0007title";
		else step.note = "Bad\u0007note";
		const at = field === "title" ? "/walkthroughs/0/title" : "/walkthroughs/0/steps/0/note";
		expect(render(diagram).diagnostics).toEqual([
			expect.objectContaining({ rule: "invalid-character", pointer: at }),
		]);
		expect(schemaPointers(diagram)).toContain(at);
	},
);

test.each([
	[{ node: "missing" }, "/node", "Node `missing`"],
	[{ node: "region" }, "/node", "Node `region`"],
	[{ edges: ["missing"] }, "/edges/0", "Edge `missing`"],
	[{ edges: [{ edge: "missing", back: true }] }, "/edges/0/edge", "Edge `missing`"],
] as const)("a Step's targets must exist on its own Diagram: %j", (step, pointer, name) => {
	const diagram = architecture({ title: "Targets" }, (d) => {
		d.group({ id: "region", kind: "region", title: "Region" }, () => {});
	});
	diagram.walkthroughs = [
		{ id: "explain", title: "Explain", steps: [structuredClone(step) as Step] },
	];
	expect(render(diagram)).toEqual({
		diagnostics: [
			{
				severity: "error",
				rule: "walkthrough-target",
				pointer: `/walkthroughs/0/steps/0${pointer}`,
				message: expect.stringContaining(name),
			},
		],
	});
});

test("a domain Walkthrough expands local Node ids and keeps Edge ids local to the Diagram", () => {
	const diagram = domain({ title: "Billing" }, (d) => {
		d.group({ id: "billing", kind: "context", title: "Billing" }, (billing) => {
			const invoice = billing.node({ id: "invoice", kind: "aggregate", title: "Invoice" });
			const issued = billing.node({ id: "issued", kind: "event", title: "Issued" });
			const emits = billing.edge(invoice, issued, { kind: "emits", id: "issue" });
			billing.walkthrough({
				id: "issue",
				title: "Issue",
				steps: [
					{ node: "invoice" },
					{ edges: [emits, { edge: "issue", back: true }] },
					{ node: issued },
				],
			});
		});
	});
	expect(diagram.walkthroughs).toEqual([
		{
			id: "issue",
			title: "Issue",
			steps: [
				{ node: "billing/invoice" },
				{ edges: ["issue", { edge: "issue", back: true }] },
				{ node: "billing/issued" },
			],
		},
	]);
	expect(render(diagram).diagnostics).toEqual([]);
	expect(schemaErrors(diagram)).toEqual([]);
});

test("an untyped author's misspelled Walkthrough options and mixed Steps are never silently dropped", () => {
	const diagram = architecture({ title: "Options" }, (d) => {
		d.node({ id: "api", kind: "service", title: "API" });
		d.edge("api", "api", { kind: "call", id: "read" });
		d.walkthrough({
			id: "explain",
			title: "Explain",
			titel: "Typo",
			steps: [
				{ node: "api", edges: ["read"], ntoe: "Typo" },
				{ edges: [{ edge: "read", bakc: true }] },
			],
		} as never);
	});
	expect(render(diagram).diagnostics.map(({ pointer }) => pointer)).toEqual([
		"/walkthroughs/0/titel",
		"/walkthroughs/0/steps/0/ntoe",
		"/walkthroughs/0/steps/1/edges/0/bakc",
		"/walkthroughs/0/steps/0",
	]);
});
