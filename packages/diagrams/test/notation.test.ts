import { describe, expect, test } from "vitest";
import {
	architectureNotation,
	builderOf,
	type Notation,
	nodeKindsOf,
	render,
	schemaOf,
} from "../src/index.ts";
import {
	draw,
	edgeGroupOf,
	groupOf,
	linesOf,
	shapesOf,
	strokeOf,
	strokesOf,
} from "./support/drawn.ts";
import { withMainframe } from "./support/mainframe.ts";
import { plumbingModel, plumbingNotation } from "./support/plumbing.ts";
import { schemaChecker, schemaPointers } from "./support/schema.ts";
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
						"The Diagram's Notation is `plumbing`, which this engine doesn't have. Its Notations are architecture and domain.",
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
						"The Diagram's Notation is `wiring`, which this engine doesn't have. Its only Notation is plumbing.",
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

	test("lets each end of an Edge carry the roles that its Kind's definition lists for that end", () => {
		const fitted = (kind: string, roles: unknown, from = "boiler", to = "pump") => ({
			...house,
			edges: [{ id: "run", kind, from, to, roles }],
		});
		const wrong = (message: string, pointer: string, rule = "edge-end-role") => ({
			severity: "error",
			rule,
			message,
			pointer,
		});

		// A pipe may start at a valve, and end at a filter.
		expect(renderPlumbing(fitted("pipe", { from: ["NRV"], to: ["FLT"] })).diagnostics).toEqual([]);
		// Another Notation's roles aren't plumbing's.
		expect(renderPlumbing(fitted("pipe", { from: ["OHS"] })).diagnostics).toEqual([
			wrong(
				"Edge `run` has the role `OHS` at its `from` end, which the plumbing Notation doesn't have. Its roles are ISO, NRV, FLT and TRP.",
				"/edges/0/roles/from/0",
				"unknown-role",
			),
		]);
		// It starts at one valve at most.
		expect(renderPlumbing(fitted("pipe", { from: ["ISO", "NRV"] })).diagnostics).toEqual([
			wrong(
				"Edge `run` has both `ISO` and `NRV` at its `from` end. An Edge of the Kind `pipe` may carry only one of them there.",
				"/edges/0/roles/from",
			),
		]);
		// A trap is a drain's, not a pipe's, at either end.
		expect(renderPlumbing(fitted("pipe", { from: ["TRP"], to: ["TRP"] })).diagnostics).toEqual([
			wrong(
				"Edge `run` has the role `TRP` at its `from` end. An Edge of the Kind `pipe` may carry only `ISO` or `NRV` there.",
				"/edges/0/roles/from/0",
			),
			wrong(
				"Edge `run` has the role `TRP` at its `to` end. An Edge of the Kind `pipe` may carry only `FLT` there.",
				"/edges/0/roles/to/0",
			),
		]);
		// A drain's trap is at its end, and its start carries nothing.
		const drained = (roles: unknown) => fitted("drain", roles, "kitchen-tap", "boiler");
		expect(renderPlumbing(drained({ to: ["TRP"] })).diagnostics).toEqual([]);
		expect(renderPlumbing(drained({ from: ["TRP", "FLT"] })).diagnostics).toEqual([
			wrong(
				"Edge `run` has the role `TRP` at its `from` end. An Edge of the Kind `drain` may carry `TRP` only at its `to` end.",
				"/edges/0/roles/from/0",
			),
			wrong(
				"Edge `run` has the role `FLT` at its `from` end. An Edge of the Kind `drain` carries no roles there.",
				"/edges/0/roles/from/1",
			),
		]);
		// A coupling is symmetric, so neither of its ends carries a role.
		expect(
			renderPlumbing(fitted("coupling", { to: ["ISO"] }, "boiler", "boiler")).diagnostics,
		).toEqual([
			wrong(
				"Edge `run` has roles, but its Kind, `coupling`, is symmetric: its two ends are alike, so it takes no roles.",
				"/edges/0/roles",
			),
		]);
		// A Kind whose definition lists no roles takes none, at either end.
		const plainDrains = {
			...plumbingNotation,
			edgeKinds: {
				...plumbingNotation.edgeKinds,
				drain: { line: "dashed", sentence: "{from} drains into {to}" },
			},
		} as const satisfies Notation;
		expect(render(drained({ to: ["TRP"] }), { notations: [plainDrains] }).diagnostics).toEqual([
			wrong("Edge `run` has roles, but an Edge of the Kind `drain` takes none.", "/edges/0/roles"),
		]);
	});

	test("flags an Edge between two Groups of a Kind that its definition says Edges cross between", () => {
		// A boiler and a pump in two rooms of the ground floor, and a tap on the floor above.
		const floors = plumbingModel({
			members: ["ground", "upper"],
			nodes: [
				{ id: "boiler", kind: "tank", title: "Boiler" },
				{ id: "pump", kind: "pump", title: "Pump" },
				{ id: "bath-tap", kind: "tap", title: "Bath tap" },
			],
			groups: [
				{ id: "ground", kind: "floor", title: "Ground floor", members: ["cellar", "utility"] },
				{ id: "cellar", kind: "room", title: "Cellar", members: ["boiler"] },
				{ id: "utility", kind: "room", title: "Utility room", members: ["pump"] },
				{ id: "upper", kind: "floor", title: "Upper floor", members: ["bath-tap"] },
			],
			edges: [
				{ id: "boiler->pump", kind: "pipe", from: "boiler", to: "pump" },
				{ id: "pump->bath-tap", kind: "pipe", from: "pump", to: "bath-tap" },
			],
		});
		const drawn = draw(floors, plumbing);
		const crossings = drawn.scene.edges.map((edge) => [
			edge.id,
			edge.crosses?.kind,
			edgeGroupOf(drawn, edge.id).attributes.get("data-crosses"),
		]);

		// Rooms are only rooms: an Edge between two of them crosses nothing.
		expect(crossings).toEqual([
			["boiler->pump", undefined, undefined],
			["pump->bath-tap", "floor", "floor"],
		]);
		expect(drawn.root.children.find((child) => child.name === "desc")?.text).toBe(
			"Nodes: Boiler (tank); Pump (pump); Bath tap (tap). Edges: Boiler feeds Pump. Pump feeds Bath tap between floors.",
		);
	});

	test("bundles its Edges as its definition says, unless the core is told otherwise", () => {
		// A boiler that feeds three taps: by source, its three pipes share a trunk out of its Port.
		const taps = ["kitchen-tap", "bath-tap", "garden-tap"];
		const fanOut = plumbingModel({
			members: ["boiler", ...taps],
			nodes: [
				{ id: "boiler", kind: "tank", title: "Boiler" },
				...taps.map((id) => ({ id, kind: "tap", title: "Tap" })),
			],
			edges: taps.map((to) => ({ id: `boiler->${to}`, kind: "pipe", from: "boiler", to })),
		});
		const routes = (bundle?: "target" | "source" | "none") =>
			render(fanOut, { ...plumbing, ...(bundle === undefined ? {} : { bundle }) }).scene?.edges.map(
				({ id, route }) => [id, route],
			);

		expect(routes()).toEqual(routes("source"));
		expect(routes()).not.toEqual(routes("target"));
		expect(routes("none")).toEqual(routes("target"));
	});

	test("describes each Node by the facts its definition lists, in its order", () => {
		const described = plumbingModel({
			members: ["boiler", "kitchen-tap"],
			nodes: [
				{ id: "boiler", kind: "tank", title: "Boiler", external: true },
				{ id: "kitchen-tap", kind: "tap", title: "Kitchen tap", status: "shut" },
			],
		});
		const { root } = draw(described, plumbing);

		expect(root.children.find((child) => child.name === "desc")?.text).toBe(
			"Nodes: Boiler (tank); Kitchen tap (shut, tap). Edges: none.",
		);
	});

	test("lets its Nodes, Groups and Edges have only the fields its definition lists", () => {
		const cellar = (node: object, group: object, edge: object) =>
			plumbingModel({
				members: ["cellar"],
				nodes: [
					{ id: "boiler", kind: "tank", title: "Boiler", ...node },
					{ id: "pump", kind: "pump", title: "Pump" },
				],
				groups: [
					{ id: "cellar", kind: "room", title: "Cellar", members: ["boiler", "pump"], ...group },
				],
				edges: [{ id: "boiler->pump", kind: "pipe", from: "boiler", to: "pump", ...edge }],
			});
		const leftOut = (pointer: string, thing: string, fields: string) => ({
			severity: "error",
			rule: "model-shape",
			message: `\`${pointer}\` must be left out: ${thing} has no such field in the plumbing Notation. Its fields are ${fields}.`,
			pointer,
		});
		const nodeFields = "`id`, `kind`, `title`, `external`, `status`, `rows` and `description`";
		const groupFields = "`id`, `kind`, `title`, `members` and `description`";
		const edgeFields = "`id`, `kind`, `from`, `to`, `label` and `roles`";

		const allowed = cellar(
			{
				external: true,
				status: "open",
				rows: [{ name: "litres", value: "200" }],
				description: "Heats the water.",
			},
			{ description: "Below the kitchen." },
			{ label: "Hot water" },
		);
		expect(renderPlumbing(allowed).diagnostics).toEqual([]);

		// Fields that the model has, and that another Notation's Diagrams may have.
		const others = cellar(
			{ technology: "copper", callout: "leaks", links: [{ id: "pump" }] },
			{ links: [{ id: "pump" }] },
			{ technology: "copper", rate: 7 },
		);
		expect(renderPlumbing(others)).toEqual({
			diagnostics: [
				leftOut("/nodes/0/technology", "a Node", nodeFields),
				leftOut("/nodes/0/callout", "a Node", nodeFields),
				leftOut("/nodes/0/links", "a Node", nodeFields),
				leftOut("/groups/0/links", "a Group", groupFields),
				leftOut("/edges/0/technology", "an Edge", edgeFields),
				leftOut("/edges/0/rate", "an Edge", edgeFields),
			],
		});
		// A field that the model doesn't have at all is listed against the Notation's fields too.
		expect(renderPlumbing(cellar({ extrenal: true }, {}, {})).diagnostics).toEqual([
			{
				severity: "error",
				rule: "model-shape",
				message: `\`/nodes/0/extrenal\` must be left out: a Node has no such field. Its fields are ${nodeFields}.`,
				pointer: "/nodes/0/extrenal",
			},
		]);
	});

	test("is checked against its own fields, beside a Diagram of another Notation that has more", () => {
		const both = { notations: [architectureNotation, plumbingNotation] };
		const calledOut = (notation: string, kind: string) => ({
			...plumbingModel({
				members: ["boiler"],
				nodes: [{ id: "boiler", kind, title: "Boiler", callout: "leaks" }],
			}),
			notation,
		});

		expect(render(calledOut("architecture", "service"), both).diagnostics).toEqual([]);
		expect(render(calledOut("plumbing", "tank"), both).diagnostics).toMatchObject([
			{ severity: "error", rule: "model-shape", pointer: "/nodes/0/callout" },
		]);
	});
});

describe("a Kind added to a Notation's definition", () => {
	/** A bank whose ledger runs on a mainframe: a Kind that only the changed definition has. */
	const bank = builderOf(withMainframe)({ title: "Bank" }, (d) => {
		const ledger = d.node({ id: "ledger", kind: "mainframe", title: "Ledger" });
		const teller = d.node({ id: "teller-app", kind: "client", title: "Teller app" });
		d.edge(teller, ledger, { kind: "call" });
	});

	test("is unknown to validation and to the schema until the definition has it", () => {
		expect(render(bank).diagnostics).toEqual([
			{
				severity: "error",
				rule: "unknown-kind",
				message:
					"Node `ledger` has the Kind `mainframe`, which the architecture Notation doesn't have. Its Node Kinds are person, system, client, gateway, service, worker, function, database, cache, queue, storage and search.",
				pointer: "/nodes/0/kind",
			},
		]);
		expect(schemaPointers(bank)).toContain("/nodes/0/kind");
	});

	test("changes validation, the schema and the drawing together, with nothing else to change", () => {
		const { diagnostics, scene, svg } = render(bank, { notations: [withMainframe] });
		const schema = schemaOf([withMainframe]);

		expect(diagnostics).toEqual([]);
		expect(scene?.nodes[0]).toMatchObject({ id: "ledger", kind: "mainframe", box: { width: 208 } });
		expect(svg).toContain('<g data-node="ledger" data-kind="mainframe">');
		expect(schemaChecker(schema).errors(bank)).toEqual([]);
		expect(schema.$defs.architecture.$defs.node.properties.kind?.enum).toEqual([
			...nodeKindsOf(architectureNotation),
			"mainframe",
		]);
		// The types change with it too: `notation.test-d.ts` checks the builder's and the model's.
	});
});
