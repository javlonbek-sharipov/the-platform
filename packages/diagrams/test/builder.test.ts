import { describe, expect, test } from "vitest";
import {
	type ArchitectureBuilder,
	architecture,
	architectureNotation,
	builderOf,
	render,
} from "../src/index.ts";
import { plumbingNotation } from "./support/plumbing.ts";

/** The builder that every Notation's is made with, here for the Notation that only the tests define. */
const plumbing = builderOf(plumbingNotation);

describe("a builder made from a Notation's definition", () => {
	test("builds a version-1 JSON model of its Notation, which the core draws", () => {
		const diagram = plumbing({ title: "House", description: "Where the water goes." }, (d) => {
			const boiler = d.node({ id: "boiler", kind: "tank", title: "Boiler", status: "open" });
			const pump = d.node({ id: "pump", kind: "pump", title: "Pump", external: true });
			d.edge(boiler, pump, { kind: "pipe", label: "Hot water" });
		});

		expect(JSON.stringify(diagram)).toBe(
			JSON.stringify({
				version: 1,
				notation: "plumbing",
				title: "House",
				description: "Where the water goes.",
				direction: "right",
				members: ["boiler", "pump"],
				nodes: [
					{ id: "boiler", kind: "tank", title: "Boiler", status: "open" },
					{ id: "pump", kind: "pump", title: "Pump", external: true },
				],
				groups: [],
				edges: [
					{ id: "boiler->pump", kind: "pipe", from: "boiler", to: "pump", label: "Hot water" },
				],
				walkthroughs: [],
			}),
		);
		const { diagnostics, svg } = render(diagram, { notations: [plumbingNotation] });
		expect(diagnostics).toEqual([]);
		expect(svg).toContain('<g data-node="boiler" data-kind="tank">');
	});

	test("takes an id and a direction for the Diagram, as every builder does", () => {
		const diagram = plumbing({ id: "docs/house", title: "House", direction: "down" }, () => {});

		expect(diagram).toMatchObject({ notation: "plumbing", id: "docs/house", direction: "down" });
	});

	test("returns a handle for each Node, which an Edge accepts in place of its id", () => {
		const diagram = plumbing({ title: "House" }, (d) => {
			const boiler = d.node({ id: "boiler", kind: "tank", title: "Boiler" });
			d.node({ id: "pump", kind: "pump", title: "Pump" });
			const pipe = d.edge(boiler, "pump", { kind: "pipe", id: "feed" });
			const drain = d.edge("pump", boiler, { kind: "drain" });

			expect([boiler.id, pipe.id, drain.id]).toEqual(["boiler", "feed", "pump->boiler"]);
		});

		expect(diagram.edges).toEqual([
			{ id: "feed", kind: "pipe", from: "boiler", to: "pump" },
			{ id: "pump->boiler", kind: "drain", from: "pump", to: "boiler" },
		]);
	});

	test("declares a Group's members inside its callback, so each one gets exactly one parent", () => {
		const diagram = plumbing({ title: "House" }, (d) => {
			const ground = d.group({ id: "ground", kind: "floor", title: "Ground floor" }, (floor) => {
				floor.group(
					{ id: "cellar", kind: "room", title: "Cellar", description: "Below the kitchen." },
					(room) => {
						room.node({ id: "boiler", kind: "tank", title: "Boiler" });
						floor.node({ id: "pump", kind: "pump", title: "Pump" });
					},
				);
				d.node({ id: "garden-tap", kind: "tap", title: "Garden tap" });
			});
			expect(ground.id).toBe("ground");
		});

		expect(diagram.members).toEqual(["ground", "garden-tap"]);
		expect(diagram.groups).toEqual([
			{ id: "ground", kind: "floor", title: "Ground floor", members: ["cellar", "pump"] },
			{
				id: "cellar",
				kind: "room",
				title: "Cellar",
				members: ["boiler"],
				description: "Below the kitchen.",
			},
		]);
	});

	test("ends an Edge at one of a Node's Rows, named through the Node's handle", () => {
		const diagram = plumbing({ title: "House" }, (d) => {
			const boiler = d.node({
				id: "boiler",
				kind: "tank",
				title: "Boiler",
				rows: [{ name: "hot", value: "60°" }, { name: "cold" }],
			});
			const tap = d.node({ id: "kitchen-tap", kind: "tap", title: "Kitchen tap" });
			d.edge(boiler.row("hot"), tap, { kind: "pipe" });
			d.edge(tap, { node: "boiler", row: "cold" }, { kind: "drain" });
		});

		expect(diagram.nodes[0]).toEqual({
			id: "boiler",
			kind: "tank",
			title: "Boiler",
			rows: [{ name: "hot", value: "60°" }, { name: "cold" }],
		});
		expect(diagram.edges.map(({ from, to }) => [from, to])).toEqual([
			[{ node: "boiler", row: "hot" }, "kitchen-tap"],
			["kitchen-tap", { node: "boiler", row: "cold" }],
		]);
	});

	test("records an error for each option it doesn't know, naming the options its Notation has", () => {
		const shape = (message: string, pointer: string) => ({
			severity: "error",
			rule: "model-shape",
			message,
			pointer,
		});
		const diagram = plumbing({ title: "House", directon: "down" } as never, (d) => {
			// A misspelled option, and options that only another Notation's Nodes and Edges have.
			d.node({ id: "boiler", kind: "tank", title: "Boiler", extrenal: true } as never);
			d.node({ id: "pump", kind: "pump", title: "Pump", technology: "copper" } as never);
			d.group({ id: "cellar", kind: "room", title: "Cellar", links: [] } as never, (room) => {
				room.node({
					id: "tap",
					kind: "tap",
					title: "Tap",
					rows: [{ name: "flow", valeu: "3" }],
				} as never);
			});
			d.edge("boiler", "pump", { kind: "pipe", rate: "2/s", lable: "Hot" } as never);
		});

		expect(render(diagram, { notations: [plumbingNotation] })).toEqual({
			diagnostics: [
				shape(
					"The Diagram has no option `directon`. Its options are `id`, `title`, `description` and `direction`.",
					"/directon",
				),
				shape(
					"A Node has no option `extrenal`. Its options are `id`, `kind`, `title`, `external`, `status`, `rows` and `description`.",
					"/nodes/0/extrenal",
				),
				shape(
					"A Node has no option `technology` in the plumbing Notation. Its options are `id`, `kind`, `title`, `external`, `status`, `rows` and `description`.",
					"/nodes/1/technology",
				),
				shape(
					"A Group has no option `links` in the plumbing Notation. Its options are `id`, `kind`, `title` and `description`.",
					"/groups/0/links",
				),
				shape(
					"A Row has no option `valeu`. Its options are `name` and `value`.",
					"/nodes/2/rows/0/valeu",
				),
				shape(
					"An Edge has no option `rate` in the plumbing Notation. Its options are `kind`, `id`, `label` and `roles`.",
					"/edges/0/rate",
				),
				shape(
					"An Edge has no option `lable`. Its options are `kind`, `id`, `label` and `roles`.",
					"/edges/0/lable",
				),
			],
		});
		// None of them reaches the model.
		expect(JSON.parse(JSON.stringify(diagram))).toMatchObject({
			nodes: [
				{ id: "boiler", kind: "tank", title: "Boiler" },
				{ id: "pump", kind: "pump", title: "Pump" },
				{ id: "tap", kind: "tap", title: "Tap", rows: [{ name: "flow" }] },
			],
			groups: [{ id: "cellar", kind: "room", title: "Cellar", members: ["tap"] }],
			edges: [{ id: "boiler->pump", kind: "pipe", from: "boiler", to: "pump" }],
		});
		expect(JSON.stringify(diagram)).not.toMatch(
			/extrenal|technology|links|valeu|rate|lable|directon/,
		);
	});

	test("records where each declaration was called from, beside the model", () => {
		const diagram = plumbing({ title: "House" }, (d) => {
			const boiler = d.node({ id: "boiler", kind: "tank", title: "Boiler" });
			d.group({ id: "cellar", kind: "room", title: "Cellar" }, (room) => {
				room.node({ id: "pump", kind: "pump", title: "Pump" });
			});
			d.edge(boiler, "pump", { kind: "pipe" });
		});
		const declarations: Record<string, { file: string; line: number }> =
			Reflect.get(diagram, Symbol.for("@the-platform/diagrams/declarations")) ?? {};

		// Each is keyed by the JSON Pointer of what it declared, and lies in this file, in order.
		expect(Object.keys(declarations)).toEqual([
			"",
			"/nodes/0",
			"/groups/0",
			"/nodes/1",
			"/edges/0",
		]);
		const places = Object.values(declarations);
		expect(places.map(({ file }) => file.split("/").at(-1))).toEqual(
			places.map(() => "builder.test.ts"),
		);
		const lines = places.map(({ line }) => line);
		expect(lines).toEqual([...lines].sort((a, b) => a - b));
		expect(new Set(lines).size).toBe(lines.length);
		// JSON, and so the model, never holds them.
		expect(Object.keys(diagram)).not.toContain("declarations");
		expect(JSON.stringify(diagram)).not.toContain("builder.test.ts");
	});
});

describe("the architecture builder", () => {
	test("builds what a builder made from the architecture Notation's definition builds", () => {
		const build = (d: ArchitectureBuilder) => {
			const web = d.node({
				id: "web-app",
				kind: "client",
				title: "Web app",
				technology: "typescript",
			});
			d.group({ id: "eu-west", kind: "region", title: "EU West" }, (eu) => {
				const api = eu.node({
					id: "shop-api",
					kind: "service",
					title: "Shop API",
					rows: [{ name: "replicas", value: "3" }],
				});
				d.edge(web, api.row("replicas"), { kind: "call", label: "Places orders", rate: "30/s" });
			});
		};
		const options = { title: "Shop", direction: "down" } as const;
		const built = architecture(options, build);

		expect(built.nodes).toHaveLength(2);
		expect(JSON.stringify(built)).toBe(
			JSON.stringify(builderOf(architectureNotation)(options, build)),
		);
	});
});
