import { expectTypeOf, test } from "vitest";
import {
	type ArchitectureNodeKind,
	type ArchitectureNotation,
	type Builder,
	builderOf,
	type Diagram,
	type DiagramOf,
	type DomainNotation,
	type Edge,
	type EdgeKindOf,
	type Group,
	type GroupKindOf,
	type Node,
	type NodeHandle,
	type NodeKindOf,
	type StatusOf,
} from "../src/index.ts";
import { withMainframe } from "./support/mainframe.ts";
import { plumbingNotation } from "./support/plumbing.ts";

/** The Notation that only the tests define, and the builder made from its definition. */
type Plumbing = typeof plumbingNotation;
const plumbing = builderOf(plumbingNotation);

test("a Notation's Kinds and statuses are the names that its definition lists", () => {
	expectTypeOf<NodeKindOf<Plumbing>>().toEqualTypeOf<"tank" | "pump" | "tap">();
	expectTypeOf<GroupKindOf<Plumbing>>().toEqualTypeOf<"room" | "floor">();
	expectTypeOf<EdgeKindOf<Plumbing>>().toEqualTypeOf<"pipe" | "drain" | "coupling">();
	expectTypeOf<StatusOf<Plumbing>>().toEqualTypeOf<"open" | "shut">();
});

test("a builder made from a definition takes only that Notation's Kinds and statuses", () => {
	plumbing({ title: "House" }, (d) => {
		expectTypeOf(d).toEqualTypeOf<Builder<Plumbing>>();
		const boiler = d.node({ id: "boiler", kind: "tank", title: "Boiler", status: "open" });
		// @ts-expect-error: `service` is a Kind of another Notation.
		d.node({ id: "pump", kind: "service", title: "Pump" });
		// @ts-expect-error: `ok` is a status of another Notation.
		d.node({ id: "kitchen-tap", kind: "tap", title: "Kitchen tap", status: "ok" });
		d.group({ id: "ground", kind: "floor", title: "Ground floor" }, (floor) => {
			expectTypeOf(floor).toEqualTypeOf<Builder<Plumbing>>();
		});
		// @ts-expect-error: `region` is a Group Kind of another Notation.
		d.group({ id: "cellar", kind: "region", title: "Cellar" }, () => {});
		// @ts-expect-error: `tank` is a Node Kind, not a Group Kind.
		d.group({ id: "attic", kind: "tank", title: "Attic" }, () => {});
		d.edge(boiler, "pump", { kind: "pipe" });
		// @ts-expect-error: `call` is an Edge Kind of another Notation.
		d.edge(boiler, "pump", { kind: "call" });
	});
});

test("a builder made from a definition takes only the options that its fields list", () => {
	plumbing({ title: "House" }, (d) => {
		d.node({
			id: "boiler",
			kind: "tank",
			title: "Boiler",
			external: true,
			status: "shut",
			rows: [{ name: "litres", value: "200" }],
			description: "Heats the water.",
		});
		// @ts-expect-error: a plumbing Node has no Technology.
		d.node({ id: "pump", kind: "pump", title: "Pump", technology: "copper" });
		// @ts-expect-error: a plumbing Node has no callout.
		d.node({ id: "kitchen-tap", kind: "tap", title: "Kitchen tap", callout: "drips" });
		// @ts-expect-error: a plumbing Node has no Links.
		d.node({ id: "bath-tap", kind: "tap", title: "Bath tap", links: [{ id: "boiler" }] });
		d.group({ id: "cellar", kind: "room", title: "Cellar", description: "Damp." }, () => {});
		// @ts-expect-error: a plumbing Group has no Links.
		d.group({ id: "attic", kind: "room", title: "Attic", links: [{ id: "boiler" }] }, () => {});
		d.edge("boiler", "pump", { kind: "pipe", id: "feed", label: "Hot water" });
		// @ts-expect-error: a plumbing Edge has no rate.
		d.edge("boiler", "pump", { kind: "pipe", rate: "2/s" });
		// @ts-expect-error: a plumbing Edge has no Technology.
		d.edge("boiler", "pump", { kind: "pipe", technology: "copper" });
	});
});

test("a builder made from a definition returns handles that carry their Nodes' Rows", () => {
	plumbing({ title: "House" }, (d) => {
		const boiler = d.node({
			id: "boiler",
			kind: "tank",
			title: "Boiler",
			rows: [{ name: "hot" }, { name: "cold", value: "12°" }],
		});
		const tap = d.node({ id: "kitchen-tap", kind: "tap", title: "Kitchen tap" });
		expectTypeOf(boiler).toEqualTypeOf<NodeHandle<"hot" | "cold">>();
		expectTypeOf(tap).toEqualTypeOf<NodeHandle>();
		d.edge(boiler.row("hot"), tap, { kind: "pipe" });
		// @ts-expect-error: `boiler` has no Row `warm`.
		d.edge(boiler.row("warm"), tap, { kind: "pipe" });
		// @ts-expect-error: `kitchen-tap` has no Rows at all.
		d.edge(boiler, tap.row("hot"), { kind: "pipe" });
		const cellar = d.group({ id: "cellar", kind: "room", title: "Cellar" }, () => {});
		// @ts-expect-error: an Edge ends at Nodes, never at a Group.
		d.edge(boiler, cellar, { kind: "pipe" });
	});
});

test("the model's types take a Notation's Kinds, statuses and fields from its definition", () => {
	type Model = DiagramOf<Plumbing>;
	expectTypeOf(plumbing({ title: "House" }, () => {})).toEqualTypeOf<Model>();
	expectTypeOf<Model["notation"]>().toEqualTypeOf<"plumbing">();
	expectTypeOf<Model["nodes"][number]["kind"]>().toEqualTypeOf<"tank" | "pump" | "tap">();
	expectTypeOf<Model["nodes"][number]["status"]>().toEqualTypeOf<"open" | "shut" | undefined>();
	expectTypeOf<Model["groups"][number]["kind"]>().toEqualTypeOf<"room" | "floor">();
	expectTypeOf<Model["edges"][number]["kind"]>().toEqualTypeOf<"pipe" | "drain" | "coupling">();
	// Each has the fields that every Notation's have, and those its definition lists.
	expectTypeOf<keyof Model["nodes"][number]>().toEqualTypeOf<
		"id" | "kind" | "title" | "external" | "status" | "rows" | "description"
	>();
	expectTypeOf<keyof Model["groups"][number]>().toEqualTypeOf<
		"id" | "kind" | "title" | "members" | "description"
	>();
	expectTypeOf<keyof Model["edges"][number]>().toEqualTypeOf<
		"id" | "kind" | "from" | "to" | "label" | "roles"
	>();
});

test("a Diagram is one of the engine's own Notations, with that Notation's Kinds and fields", () => {
	expectTypeOf<Diagram["notation"]>().toEqualTypeOf<"architecture" | "domain">();
	// Its `notation` tells which, and so which Kinds and fields its Nodes, Groups and Edges have.
	type Architecture = Extract<Diagram, { notation: "architecture" }>;
	expectTypeOf<Architecture>().toEqualTypeOf<DiagramOf<ArchitectureNotation>>();
	expectTypeOf<Extract<Diagram, { notation: "domain" }>>().toEqualTypeOf<
		DiagramOf<DomainNotation>
	>();
	type ArchitectureNode = Architecture["nodes"][number];
	type ArchitectureGroup = Architecture["groups"][number];
	type ArchitectureEdge = Architecture["edges"][number];
	expectTypeOf<ArchitectureNode["kind"]>().toEqualTypeOf<ArchitectureNodeKind>();
	expectTypeOf<ArchitectureNode["status"]>().toEqualTypeOf<
		"ok" | "degraded" | "down" | "unknown" | undefined
	>();
	expectTypeOf<ArchitectureGroup["kind"]>().toEqualTypeOf<"system" | "region" | "zone">();
	expectTypeOf<ArchitectureEdge["kind"]>().toEqualTypeOf<"call" | "message">();
	expectTypeOf<keyof ArchitectureNode>().toEqualTypeOf<
		| "id"
		| "kind"
		| "title"
		| "technology"
		| "external"
		| "status"
		| "rows"
		| "description"
		| "links"
		| "callout"
	>();
	expectTypeOf<keyof ArchitectureGroup>().toEqualTypeOf<
		"id" | "kind" | "title" | "members" | "description" | "links"
	>();
	expectTypeOf<keyof ArchitectureEdge>().toEqualTypeOf<
		"id" | "kind" | "from" | "to" | "label" | "technology" | "rate"
	>();
	// A Node, a Group and an Edge are those of any of them.
	expectTypeOf<Node>().toEqualTypeOf<Diagram["nodes"][number]>();
	expectTypeOf<Node["kind"]>().toEqualTypeOf<ArchitectureNodeKind | "context">();
	expectTypeOf<Group>().toEqualTypeOf<Diagram["groups"][number]>();
	expectTypeOf<Edge>().toEqualTypeOf<Diagram["edges"][number]>();
	// A plumbing Diagram isn't one, and nor is a Diagram with another Notation's Kind.
	expectTypeOf<DiagramOf<Plumbing>>().not.toExtend<Diagram>();
	expectTypeOf<{ id: string; kind: "tank"; title: string }>().not.toExtend<Node>();
});

test("a Kind added to a definition is a Kind of its builder and of its model", () => {
	type Extended = typeof withMainframe;
	expectTypeOf<NodeKindOf<Extended>>().toEqualTypeOf<ArchitectureNodeKind | "mainframe">();
	expectTypeOf<DiagramOf<Extended>["nodes"][number]["kind"]>().toEqualTypeOf<
		ArchitectureNodeKind | "mainframe"
	>();
	builderOf(withMainframe)({ title: "Bank" }, (d) => {
		d.node({ id: "ledger", kind: "mainframe", title: "Ledger", technology: "cobol" });
		d.node({ id: "teller-app", kind: "client", title: "Teller app" });
		// @ts-expect-error: `minicomputer` isn't a Kind of the definition.
		d.node({ id: "branch", kind: "minicomputer", title: "Branch" });
	});
});
