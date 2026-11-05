import { describe, expect, test } from "vitest";
import { render } from "../src/index.ts";
import {
	draw,
	edgeGroupOf,
	groupOf,
	linesOf,
	shapesOf,
	strokeOf,
	strokesOf,
} from "./support/drawn.ts";
import { plumbingModel, plumbingNotation } from "./support/plumbing.ts";
import { computedStyle, descendants, isShape, runsOf } from "./support/svg.ts";

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
			["boiler", 160, 64],
			["pump", 128, 48],
			["kitchen-tap", 144, 48],
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
		expect(silhouette("boiler")).toMatch(/ A 79\.25 7 /);
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

	test("has the statuses its definition lists, each drawn as its mark, in its color", () => {
		const taps = (...statuses: string[]) =>
			plumbingModel({
				members: statuses.map((status) => `${status}-tap`),
				nodes: statuses.map((status) => ({
					id: `${status}-tap`,
					kind: "tap",
					title: "Tap",
					status,
				})),
			});

		expect(renderPlumbing(taps("ok"))).toEqual({
			diagnostics: [
				{
					severity: "error",
					rule: "unknown-status",
					message:
						"Node `ok-tap` has the status `ok`, which the plumbing Notation doesn't have. Its statuses are open and shut.",
					pointer: "/nodes/0/status",
				},
			],
		});

		const drawn = draw(taps("open", "shut"), plumbing);
		const marks = drawn.scene.nodes.map(({ id, status }) => {
			const mark = shapesOf(drawn, id).find((shape) =>
				shape.attributes.get("class")?.startsWith("diagram-status-"),
			);
			const style = mark === undefined ? undefined : computedStyle(mark, drawn.rules, "light");
			return [status?.value, mark?.attributes.get("d"), style?.get("fill"), style?.get("stroke")];
		});
		expect(marks).toEqual([
			["open", "M 6 1 L 10 7 A 4 4 0 1 1 2 7 Z", "#1a7f37", "#1a7f37"],
			["shut", "M 2 6 H 10", "none", "#d1242f"],
		]);
	});

	test("draws an Edge of a symmetric Kind as a line alone, with no arrowhead and no chevrons", () => {
		const coupled = plumbingModel({
			members: ["boiler", "cistern", "pump"],
			nodes: [
				{ id: "boiler", kind: "tank", title: "Boiler" },
				{ id: "cistern", kind: "tank", title: "Cistern" },
				{ id: "pump", kind: "pump", title: "Pump" },
			],
			edges: [
				{ id: "boiler->cistern", kind: "coupling", from: "boiler", to: "cistern" },
				{ id: "cistern->pump", kind: "pipe", from: "cistern", to: "pump" },
			],
		});
		const drawn = draw(coupled, plumbing);
		const drawing = drawn.scene.edges.map((edge) => {
			const lines = linesOf(drawn, edge);
			const marks = descendants(edgeGroupOf(drawn, edge.id)).filter(
				(shape) => isShape(shape) && !lines.includes(shape),
			);
			const reach = Math.min(
				...lines
					.flatMap(runsOf)
					.flat()
					.map((point) => Math.hypot(point.x - edge.toPort.point.x, point.y - edge.toPort.point.y)),
			);
			return {
				edge: edge.id,
				chevrons: edge.chevrons.length,
				lines: lines.length,
				marks: marks.length,
				// How far the line stops short of its target's Port.
				short: reach,
			};
		});

		expect(drawing).toEqual([
			// Its casing and its body, which run all the way into the Port.
			{ edge: "boiler->cistern", chevrons: 0, lines: 2, marks: 0, short: 0 },
			// A directed Edge has a chevron, cased like its line, and an arrowhead that its line stops inside.
			{ edge: "cistern->pump", chevrons: 1, lines: 2, marks: 3, short: 7 },
		]);
		expect(drawn.root.children.find((child) => child.name === "desc")?.text).toBe(
			"Nodes: Boiler (tank); Cistern (tank); Pump (pump). Edges: Boiler is coupled with Cistern. Cistern feeds Pump.",
		);
	});

	test("lets each Edge Kind join only the Node Kinds its definition allows", () => {
		const joined = (kind: string, from: unknown, to: unknown) => ({
			...house,
			nodes: [
				{ id: "boiler", kind: "tank", title: "Boiler", rows: [{ name: "outlet" }] },
				{ id: "pump", kind: "pump", title: "Pump" },
				{ id: "kitchen-tap", kind: "tap", title: "Kitchen tap" },
			],
			edges: [{ id: "joint", kind, from, to }],
		});
		const wrongEnd = (message: string, pointer: string) => ({
			severity: "error",
			rule: "edge-end-kind",
			message,
			pointer,
		});

		// The house's pipes run from a tank to a pump, and from a pump to a tap.
		expect(renderPlumbing(house).diagnostics).toEqual([]);
		// A drain's definition names no Kinds, so it joins any two.
		expect(renderPlumbing(joined("drain", "kitchen-tap", "kitchen-tap")).diagnostics).toEqual([]);
		expect(renderPlumbing(joined("pipe", "kitchen-tap", "boiler"))).toEqual({
			diagnostics: [
				wrongEnd(
					"Edge `joint` starts at `kitchen-tap`, whose Kind is `tap`. An Edge of the Kind `pipe` may start only at a Node of the Kind `tank` or `pump`.",
					"/edges/0/from",
				),
				wrongEnd(
					"Edge `joint` ends at `boiler`, whose Kind is `tank`. An Edge of the Kind `pipe` may end only at a Node of the Kind `pump` or `tap`.",
					"/edges/0/to",
				),
			],
		});
		// An end at a Row is judged by its Node's Kind, and pointed at by its Node.
		expect(renderPlumbing(joined("coupling", { node: "boiler", row: "outlet" }, "pump"))).toEqual({
			diagnostics: [
				wrongEnd(
					"Edge `joint` ends at `pump`, whose Kind is `pump`. An Edge of the Kind `coupling` may end only at a Node of the Kind `tank`.",
					"/edges/0/to",
				),
			],
		});
		expect(renderPlumbing(joined("pipe", { node: "kitchen-tap", row: "spout" }, "pump"))).toEqual({
			diagnostics: [
				wrongEnd(
					"Edge `joint` starts at `kitchen-tap`, whose Kind is `tap`. An Edge of the Kind `pipe` may start only at a Node of the Kind `tank` or `pump`.",
					"/edges/0/from/node",
				),
				{
					severity: "error",
					rule: "edge-end",
					message: "Edge `joint` starts at the Row `spout` of `kitchen-tap`, which has no Rows.",
					pointer: "/edges/0/from/row",
				},
			],
		});
	});
});
