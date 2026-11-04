import { expectTypeOf, test } from "vitest";
import {
	type ArchitectureEdgeKind,
	type ArchitectureNodeKind,
	architecture,
	type NodeHandle,
} from "../src/index.ts";

test("the architecture Notation has 12 Node Kinds and two Edge Kinds", () => {
	expectTypeOf<ArchitectureNodeKind>().toEqualTypeOf<
		| "person"
		| "system"
		| "client"
		| "gateway"
		| "service"
		| "worker"
		| "function"
		| "database"
		| "cache"
		| "queue"
		| "storage"
		| "search"
	>();
	expectTypeOf<ArchitectureEdgeKind>().toEqualTypeOf<"call" | "message">();
});

test("a Node Kind that the Notation doesn't have is a type error", () => {
	architecture({ title: "Shop" }, (d) => {
		// @ts-expect-error: `servce` isn't an architecture Kind.
		d.node({ id: "shop-api", kind: "servce", title: "Shop API" });
	});
});

test("an Edge Kind that the Notation doesn't have is a type error", () => {
	architecture({ title: "Shop" }, (d) => {
		const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
		const db = d.node({ id: "shop-db", kind: "database", title: "Shop database" });
		// @ts-expect-error: `rest` isn't an architecture Edge Kind.
		d.edge(api, db, { kind: "rest" });
	});
});

test("declaring a Node returns a handle that an Edge accepts", () => {
	architecture({ title: "Shop" }, (d) => {
		const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
		expectTypeOf(api).toEqualTypeOf<NodeHandle>();
		expectTypeOf(d.edge).parameter(0).toExtend<NodeHandle | string>();
		// @ts-expect-error: an Edge end is a handle or an id, not a number.
		d.edge(api, 7, { kind: "call" });
	});
});

test("a status that the Notation doesn't have is a type error", () => {
	architecture({ title: "Shop" }, (d) => {
		d.node({ id: "shop-api", kind: "service", title: "Shop API", status: "degraded" });
		// @ts-expect-error: `broken` isn't a status.
		d.node({ id: "shop-db", kind: "database", title: "Shop database", status: "broken" });
	});
});
