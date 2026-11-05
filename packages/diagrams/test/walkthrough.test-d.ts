import { expectTypeOf, test } from "vitest";
import { architecture, domain, type Step, type WalkthroughDeclaration } from "../src/index.ts";

test("typed Steps choose Edges or one Node, and share their API across Notations", () => {
	const shared = {
		id: "explain",
		title: "Explain",
		steps: [{ edges: ["read", { edge: "read", back: true }] }, { node: "api", note: "Done" }],
	} as const satisfies WalkthroughDeclaration;
	architecture({ title: "Shop" }, (d) => {
		const api = d.node({ id: "api", kind: "service", title: "API", rows: [{ name: "replicas" }] });
		const read = d.edge(api, api, { kind: "call" });
		d.walkthrough(shared);
		d.walkthrough({
			id: "one",
			title: "One",
			steps: [{ node: api }, { edges: [read, { edge: read, back: false }] }],
		});
		// @ts-expect-error: a Step chooses exactly one of Edges and a Node.
		d.walkthrough({ id: "both", title: "Both", steps: [{ node: api, edges: [read] }] });
		// @ts-expect-error: a Step needs a target.
		d.walkthrough({ id: "none", title: "None", steps: [{ note: "Nothing" }] });
		// @ts-expect-error: back is a boolean.
		d.walkthrough({ id: "back", title: "Back", steps: [{ edges: [{ edge: read, back: "yes" }] }] });
	});
	domain({ title: "Domain" }, (d) => {
		d.walkthrough(shared);
	});
	expectTypeOf<{ node: string; edges: string[] }>().not.toExtend<Step>();
});
