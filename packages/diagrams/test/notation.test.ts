import { describe, expect, test } from "vitest";
import { render } from "../src/index.ts";
import { draw, groupOf, linesOf, shapesOf, strokeOf, strokesOf } from "./support/drawn.ts";
import { plumbingModel, plumbingNotation } from "./support/plumbing.ts";
import { descendants, isShape } from "./support/svg.ts";

/** Reads only the plumbing Notation, in place of the engine's own. */
const plumbing = { notations: [plumbingNotation] };

/** Renders a Diagram with a core that's given the plumbing Notation, in place of the engine's own. */
function renderPlumbing(diagram: unknown) {
	return render(diagram, plumbing);
}

/**
 * A boiler that a pump feeds a kitchen tap from, which drains back into the
 * boiler: one Node of each plumbing Kind.
 */
const house = plumbingModel({
	members: ["boiler", "pump", "kitchen-tap"],
	nodes: [
		{ id: "boiler", kind: "tank", title: "Boiler" },
		{ id: "pump", kind: "pump", title: "Pump" },
		{ id: "kitchen-tap", kind: "tap", title: "Kitchen tap" },
	],
	edges: [
		{ id: "boiler->pump", kind: "pipe", from: "boiler", to: "pump" },
		{ id: "pump->kitchen-tap", kind: "pipe", from: "pump", to: "kitchen-tap" },
		{ id: "kitchen-tap->boiler", kind: "drain", from: "kitchen-tap", to: "boiler" },
	],
});

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

	test("lays out each Node at the size its Kind sets", () => {
		const { scene } = draw(house, plumbing);
		const sizes = scene.nodes.map(({ id, box }) => [id, box.width, box.height]);

		expect(sizes).toEqual([
			["boiler", 144, 64],
			["pump", 128, 48],
			["kitchen-tap", 112, 48],
		]);
	});

	test("draws each Node with its Kind's badge and outline", () => {
		const drawn = draw(house, plumbing);
		const paths = (id: string) =>
			descendants(groupOf(drawn, id)).flatMap((element) => element.attributes.get("d") ?? []);
		/** The path of a Node's silhouette: its one shape that the hue tints. */
		const silhouette = (id: string) => {
			const tinted = shapesOf(drawn, id).filter((shape) => shape.attributes.has("fill-opacity"));
			expect(tinted, id).toHaveLength(1);
			return tinted[0]?.attributes.get("d") ?? "";
		};

		expect(paths("boiler")).toContain("M 3 3 H 13 V 13 H 3 Z");
		expect(paths("pump")).toContain("M 8 2 L 14 14 H 2 Z");
		expect(paths("kitchen-tap")).toContain("M 2 8 H 14 M 8 2 V 14");
		// A tank is a cylinder, whose lid and base are halves of ellipses.
		expect(silhouette("boiler")).toMatch(/ A 71\.25 7 /);
		// A pump is a rectangle with its four corners cut off, so it has eight.
		expect(silhouette("pump")).toMatch(/^M [\d.]+ [\d.]+(?: L [\d.]+ [\d.]+){7} Z$/);
		// A tap is a pill: both ends round right through, by half its height inside its stroke.
		expect(silhouette("kitchen-tap").match(/A [\d.]+ [\d.]+ /g)).toEqual(
			Array.from({ length: 4 }, () => "A 23.25 23.25 "),
		);
	});

	test("draws each Node in its Kind's hue, a color of the theme that its definition names", () => {
		const drawn = draw(house, plumbing);
		const hues = (theme: "light" | "dark") =>
			drawn.scene.nodes.map(({ id }) => [id, [...strokesOf(drawn, id, theme)]]);

		expect(hues("light")).toEqual([
			["boiler", ["#0b6e99"]],
			["pump", ["#6b5b3e"]],
			["kitchen-tap", ["#6b5b3e"]],
		]);
		expect(hues("dark")).toEqual([
			["boiler", ["#5cc8f0"]],
			["pump", ["#d9c08a"]],
			["kitchen-tap", ["#d9c08a"]],
		]);
		// A page sets a hue by its property, `--diagram-hue-` and the hue's name.
		// The Kinds that share a hue share its rule.
		const scope = `.${drawn.root.attributes.get("class")} `;
		const hueRules = drawn.rules
			.filter(({ dark, selectors }) => !dark && selectors.some((s) => s.includes("[data-node]")))
			.map((rule) => [rule.selectors.map((s) => s.replace(scope, "")), rule.declarations]);
		expect(hueRules).toEqual([
			[['[data-node][data-kind="tank"]'], [["color", "var(--diagram-hue-water, #0b6e99)"]]],
			[
				['[data-node][data-kind="pump"]', '[data-node][data-kind="tap"]'],
				[["color", "var(--diagram-hue-metal, #6b5b3e)"]],
			],
		]);
	});

	test("has the Group Kinds its definition lists, each drawn with its Kind's border", () => {
		const grouped = (kind: string) =>
			plumbingModel({
				members: ["ground"],
				nodes: [{ id: "boiler", kind: "tank", title: "Boiler" }],
				groups: [
					{ id: "ground", kind, title: "Ground floor", members: ["cellar"] },
					{ id: "cellar", kind: "room", title: "Cellar", members: ["boiler"] },
				],
			});

		expect(renderPlumbing(grouped("region"))).toEqual({
			diagnostics: [
				{
					severity: "error",
					rule: "unknown-kind",
					message:
						"Group `ground` has the Kind `region`, which the plumbing Notation doesn't have. Its Group Kinds are room and floor.",
					pointer: "/groups/0/kind",
				},
			],
		});
		const drawn = draw(grouped("floor"), plumbing);
		const borders = descendants(drawn.root)
			.filter((element) => element.attributes.has("data-group"))
			.map((group) => {
				const [border] = group.children.filter(isShape);
				return [
					group.attributes.get("data-group"),
					group.attributes.get("data-kind"),
					border?.attributes.get("stroke-width"),
					border?.attributes.get("stroke-dasharray"),
				];
			});
		expect(borders).toEqual([
			["ground", "floor", "2.5", undefined],
			["cellar", "room", "1", "6 4"],
		]);
	});

	test("has the Edge Kinds its definition lists, each drawn with its Kind's line", () => {
		const unknown = { ...house, edges: [{ id: "feed", kind: "call", from: "boiler", to: "pump" }] };
		expect(renderPlumbing(unknown)).toEqual({
			diagnostics: [
				{
					severity: "error",
					rule: "unknown-kind",
					message:
						"Edge `feed` has the Kind `call`, which the plumbing Notation doesn't have. Its Edge Kinds are pipe, drain and coupling.",
					pointer: "/edges/0/kind",
				},
			],
		});

		const drawn = draw(house, plumbing);
		const dashes = drawn.scene.edges.map((edge) => [
			edge.id,
			edge.kind,
			...new Set(linesOf(drawn, edge).map((line) => strokeOf(drawn, line, "light").dashes)),
		]);
		expect(dashes).toEqual([
			["boiler->pump", "pipe", "none"],
			["pump->kitchen-tap", "pipe", "none"],
			["kitchen-tap->boiler", "drain", "6 4"],
		]);
	});

	test("describes each Edge in its Kind's sentence form", () => {
		const { root } = draw(house, plumbing);

		expect(root.children.find((child) => child.name === "desc")?.text).toBe(
			"Nodes: Boiler (tank); Pump (pump); Kitchen tap (tap). Edges: Boiler feeds Pump. Pump feeds Kitchen tap. Kitchen tap drains into Boiler.",
		);
	});
});
