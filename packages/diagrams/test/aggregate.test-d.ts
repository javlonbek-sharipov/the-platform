import { expectTypeOf, test } from "vitest";
import {
	type DomainGroup,
	type DomainGroupKind,
	type DomainNode,
	type DomainRow,
	domain,
	type GroupHandle,
	type NodeHandle,
} from "../src/index.ts";

test("aggregates, events and their context Group are typed, with Row names carried by Node handles", () => {
	expectTypeOf<DomainGroupKind>().toEqualTypeOf<"context">();
	expectTypeOf<DomainRow<"Money">>().toEqualTypeOf<{ name: "Money"; value?: string }>();
	const billing = { id: "billing", kind: "context", title: "Billing" } satisfies DomainGroup;
	const invoice = {
		id: "invoice",
		kind: "aggregate",
		title: "Invoice",
		rows: [{ name: "Money", value: "value object" }],
	} as const satisfies DomainNode;
	domain({ title: "Billing" }, (d) => {
		expectTypeOf(
			d.group(billing, (billing) => {
				const handle = billing.node(invoice);
				expectTypeOf(handle).toEqualTypeOf<NodeHandle<"Money">>();
				const event = billing.node({ id: "invoiced", kind: "event", title: "Invoiced" });
				billing.edge(handle, event, { kind: "emits" });
				billing.edge(event, handle, { kind: "reacts", id: "reacts" });
				billing.edge(handle.row("Money"), handle, { kind: "references", id: "money" });
				// @ts-expect-error: an aggregate has only the Rows it declares.
				handle.row("Missing");
				// @ts-expect-error: an event without Rows has none to attach to.
				event.row("Money");
				// @ts-expect-error: entities belong in Rows, not in a Node Kind.
				billing.node({ id: "line", kind: "entity", title: "Line" });
				// @ts-expect-error: an aggregate is a Node, never a Group.
				billing.group({ id: "order", kind: "aggregate", title: "Order" }, () => {});
			}),
		).toEqualTypeOf<GroupHandle>();
	});
});
