import { describe, expect, test } from "vitest";
import {
	architecture,
	type Diagram,
	type Direction,
	type Row,
	type RowEnd,
	render,
	type Scene,
	type SceneNode,
	type SceneText,
} from "../src/index.ts";
import { advanceOf, bundledFont, characterMap, unitsPerEm } from "./support/truetype.ts";

const interRegular = bundledFont("Inter-Regular.ttf");
const regularCharacters = characterMap(interRegular);

/** A text's width in Inter Regular, read from the font file: its characters' advance widths, summed. */
function widthInInterRegular(text: string, size: number): number {
	let units = 0;
	for (const character of text) {
		const glyph = regularCharacters.get(character.codePointAt(0) ?? 0);
		if (glyph === undefined) {
			throw new Error(`Inter Regular has no ${character}`);
		}
		units += advanceOf(interRegular, glyph);
	}
	return (units * size) / unitsPerEm(interRegular);
}

const directions: Direction[] = ["right", "down"];

function sceneOf(diagram: unknown): Scene {
	const { scene, diagnostics } = render(diagram);
	expect(diagnostics).toEqual([]);
	if (scene === undefined) {
		throw new Error("expected a scene");
	}
	return scene;
}

function nodeOf(scene: Scene, id: string): SceneNode {
	const node = scene.nodes.find((candidate) => candidate.id === id);
	if (node === undefined) {
		throw new Error(`no Node ${id} in the scene`);
	}
	return node;
}

/** Where a piece of text starts and ends, drawn centered on its point. */
function extent(text: SceneText): { left: number; right: number } {
	return { left: text.point.x - text.width / 2, right: text.point.x + text.width / 2 };
}

/** The Orders database alone, with the first `count` of its Rows. */
function database(direction: Direction, count: number): Diagram {
	const rows = [
		{ name: "replicas", value: "3" },
		{ name: "region", value: "eu-west-1" },
		{ name: "engine", value: "Postgres 17" },
	];
	return architecture({ title: "Rows", direction }, (d) => {
		d.node({
			id: "orders-db",
			kind: "database",
			title: "Orders database",
			rows: rows.slice(0, count),
		});
	});
}

/** A number as the SVG writes it: rounded to two decimals. */
function rounded(value: number): number {
	return Math.round(value * 100) / 100;
}

/** The inside of a Node's group in an SVG. */
function nodeGroup(svg: string, id: string): string {
	const group = svg.match(new RegExp(`<g data-node="${id}"[^>]*>([\\s\\S]*?)</g>`))?.[1];
	if (group === undefined) {
		throw new Error(`no group for Node ${id}`);
	}
	return group;
}

/** Each `<text>` in a piece of SVG, with its position, size, weight and text. */
function textsIn(svg: string) {
	return [
		...svg.matchAll(
			/<text x="([^"]*)" y="([^"]*)" font-size="([^"]*)" font-weight="([^"]*)"[^>]*>([^<]*)<\/text>/g,
		),
	].map(([, x, y, size, weight, text]) => ({
		x: Number(x),
		y: Number(y),
		size: Number(size),
		weight: Number(weight),
		text,
	}));
}

describe.each(directions)("Rows on a Diagram laid out %s", (direction) => {
	test("each add a band to their Node's height, below its header", () => {
		const [plain, ...withRows] = [0, 1, 2, 3].map((count) =>
			nodeOf(sceneOf(database(direction, count)), "orders-db"),
		);
		if (plain === undefined) {
			throw new Error("expected a Node without Rows");
		}
		const band = (withRows[0]?.box.height ?? 0) - plain.box.height;
		expect(band).toBeGreaterThan(0);
		withRows.forEach((node, index) => {
			expect(node.box.width).toBe(plain.box.width);
			expect(node.box.height).toBe(plain.box.height + (index + 1) * band);
			// The header keeps its height, and its title its place.
			expect(node.title.point.y - node.box.y).toBe(plain.title.point.y - plain.box.y);
			expect(node.rows).toHaveLength(index + 1);
			node.rows.forEach((row, at) => {
				const top = node.box.y + plain.box.height + at * band;
				expect(row.box).toEqual({ x: node.box.x, y: top, width: node.box.width, height: band });
			});
		});
	});

	test("show their names on the left and their values on the right, each Row level within its band", () => {
		const node = nodeOf(sceneOf(database(direction, 3)), "orders-db");
		const names = node.rows.map((row) => row.name);
		const values = node.rows.map((row) => row.value);
		expect(names.map((name) => name.text)).toEqual(["replicas", "region", "engine"]);
		expect(values.map((value) => value?.text)).toEqual(["3", "eu-west-1", "Postgres 17"]);

		const middle = node.box.x + node.box.width / 2;
		for (const [index, { box, name, value }] of node.rows.entries()) {
			if (value === undefined) {
				throw new Error("expected a value");
			}
			expect(name.point.y).toBe(value.point.y);
			expect(name.point.y).toBeGreaterThan(box.y);
			expect(name.point.y).toBeLessThan(box.y + box.height);
			// Names line up on the left, and values on the right.
			expect(extent(name).left).toBe(extent(names[0] ?? name).left);
			expect(extent(value).right).toBe(extent(values[0] ?? value).right);
			expect(extent(name).left, `Row ${index}`).toBeGreaterThan(node.box.x);
			expect(extent(name).left, `Row ${index}`).toBeLessThan(middle);
			expect(extent(value).right, `Row ${index}`).toBeGreaterThan(middle);
			expect(extent(value).right, `Row ${index}`).toBeLessThan(node.box.x + node.box.width);
			expect(extent(name).right).toBeLessThan(extent(value).left);
			for (const text of [name, value]) {
				expect(text.weight).toBe("regular");
				expect(text.shortened).toBe(false);
			}
		}
	});
});

describe.each(directions)("the Ports of a Diagram laid out %s", (direction) => {
	test("include one on each side of the Node for every Row, level with the Row, each with a stub out of its side", () => {
		const node = nodeOf(sceneOf(database(direction, 3)), "orders-db");
		expect(node.rows).toHaveLength(3);
		for (const { name, input, output } of node.rows) {
			const level = name.point.y;
			expect(input).toMatchObject({ side: "left", point: { x: node.box.x, y: level } });
			expect(output).toMatchObject({
				side: "right",
				point: { x: node.box.x + node.box.width, y: level },
			});
			expect(input.stub.y).toBe(level);
			expect(input.stub.x).toBeLessThan(node.box.x);
			expect(output.stub.y).toBe(level);
			expect(output.stub.x).toBeGreaterThan(node.box.x + node.box.width);
		}
	});

	test("keep the header's own Ports where the direction puts them, level with the header", () => {
		const node = nodeOf(sceneOf(database(direction, 3)), "orders-db");
		const { box, title, input, output } = node;
		if (direction === "right") {
			expect(input.point).toEqual({ x: box.x, y: title.point.y });
			expect(output.point).toEqual({ x: box.x + box.width, y: title.point.y });
		} else {
			expect(input.point).toEqual({ x: title.point.x, y: box.y });
			expect(output.point).toEqual({ x: title.point.x, y: box.y + box.height });
		}
	});
});

/**
 * Edges attached to Rows: the Orders API publishes to the `order-placed`
 * topic, which the Payments API reads, and the Payments API publishes back
 * to `order-paid`, against the direction. Each API writes to its own table
 * in the Orders database.
 */
function attached(direction: Direction): Diagram {
	return architecture({ title: "Attached", direction }, (d) => {
		const api = d.node({ id: "orders-api", kind: "service", title: "Orders API" });
		const events = d.node({
			id: "order-events",
			kind: "queue",
			title: "Order events",
			rows: [{ name: "order-placed" }, { name: "order-paid" }],
		});
		const payments = d.node({ id: "payments-api", kind: "service", title: "Payments API" });
		const db = d.node({
			id: "orders-db",
			kind: "database",
			title: "Orders database",
			rows: [
				{ name: "orders", value: "table" },
				{ name: "payments", value: "table" },
			],
		});
		d.edge(api, events.row("order-placed"), { kind: "message" });
		d.edge(events.row("order-placed"), payments, { kind: "message" });
		d.edge(payments, events.row("order-paid"), { kind: "message" });
		d.edge(api, db.row("orders"), { kind: "call" });
		d.edge(payments, db.row("payments"), { kind: "call" });
	});
}

/** The Row that an Edge end names, as the scene draws it. */
function rowAt(scene: Scene, diagram: Diagram, end: RowEnd) {
	const index = diagram.nodes
		.find((node) => node.id === end.node)
		?.rows?.findIndex((row) => row.name === end.row);
	const row = nodeOf(scene, end.node).rows[index ?? -1];
	if (row === undefined) {
		throw new Error(`no Row ${end.row} on ${end.node}`);
	}
	return row;
}

describe.each(directions)("an Edge attached to a Row, on a Diagram laid out %s", (direction) => {
	test("leaves or enters at that Row's Port on the matching side, level with the Row", () => {
		const diagram = attached(direction);
		const scene = sceneOf(diagram);
		let attachments = 0;
		for (const { id, from, to } of diagram.edges) {
			const edge = scene.edges.find((candidate) => candidate.id === id);
			const [first, last] = [edge?.route[0], edge?.route.at(-1)];
			if (typeof from !== "string") {
				const row = rowAt(scene, diagram, from);
				const { box } = nodeOf(scene, from.node);
				expect(edge?.fromPort, id).toEqual(row.output);
				expect(first && { x: first.x, y: first.y }, id).toEqual({
					x: box.x + box.width,
					y: row.name.point.y,
				});
				attachments += 1;
			}
			if (typeof to !== "string") {
				const row = rowAt(scene, diagram, to);
				const { box } = nodeOf(scene, to.node);
				expect(edge?.toPort, id).toEqual(row.input);
				expect(last && { x: last.x, y: last.y }, id).toEqual({ x: box.x, y: row.name.point.y });
				attachments += 1;
			}
		}
		expect(attachments).toBe(5);
	});
});

describe("the SVG", () => {
	test("draws each Row's name and value in its Node's group, in the regular weight, where the scene puts them", () => {
		for (const direction of directions) {
			const { scene, svg } = render(database(direction, 3));
			const node = nodeOf(scene ?? sceneOf(null), "orders-db");
			const drawn = (text: SceneText) => ({
				x: rounded(text.point.x),
				y: rounded(text.point.y),
				size: text.size,
				weight: text.weight === "regular" ? 400 : 600,
				text: text.text,
			});
			expect(textsIn(nodeGroup(svg ?? "", "orders-db"))).toEqual(
				[node.title, ...node.rows.flatMap((row) => [row.name, row.value ?? row.name])].map(drawn),
			);
		}
	});

	test("draws a line across the Node between its header and its first Row", () => {
		const { scene, svg } = render(database("right", 2));
		const node = nodeOf(scene ?? sceneOf(null), "orders-db");
		const top = node.rows[0]?.box.y;
		const lines = [
			...nodeGroup(svg ?? "", "orders-db").matchAll(
				/<line x1="([^"]*)" y1="([^"]*)" x2="([^"]*)" y2="([^"]*)"/g,
			),
		].map((match) => match.slice(1).map(Number));
		expect(lines).toEqual([[node.box.x, top, node.box.x + node.box.width, top]]);
		expect(nodeGroup(render(database("right", 0)).svg ?? "", "orders-db")).not.toContain("<line");
	});

	test("asks for the regular weight's glyphs for the characters that Rows draw", () => {
		const weights: Record<string, string> = {};
		render(database("right", 3), {
			fontData: ({ weight, characters }) => {
				weights[weight] = characters;
				return new Uint8Array([1]);
			},
		});
		// Every character of "replicas", "3", "region", "eu-west-1", "engine" and "Postgres 17", once, in order.
		expect(weights.regular).toBe(" -137Pacegilnoprstuw");
		// Every character of "Orders database".
		expect(weights.semibold).toBe(" Oabderst");
	});
});

/** The Orders database with the given Rows, rendered, and the diagnostics of the render. */
function withRows(rows: Row[]): { node: SceneNode; diagnostics: unknown[] } {
	const { scene, diagnostics } = render(
		architecture({ title: "Rows" }, (d) => {
			d.node({ id: "orders-db", kind: "database", title: "Orders database", rows });
		}),
	);
	return { node: nodeOf(scene ?? sceneOf(null), "orders-db"), diagnostics };
}

/** The first Row's name and value, as drawn. */
function firstRow(rows: Row[]): { name: SceneText; value?: SceneText } {
	const row = withRows(rows).node.rows[0];
	if (row === undefined) {
		throw new Error("expected a Row");
	}
	return row;
}

describe("a Row too wide for its Node", () => {
	const tooWide = [
		{ name: "maximum connections per replica", value: "4000" },
		{ name: "Shipping address validation rules", value: "value object" },
		{ name: "read replicas in each availability zone", value: "2" },
	];

	test("has its name shortened, keeping as much of it as fits beside the full value", () => {
		for (const { name: full, value } of tooWide) {
			const { name, value: drawnValue } = firstRow([{ name: full, value }]);
			expect(drawnValue?.text, full).toBe(value);
			expect(drawnValue?.shortened, full).toBe(false);
			expect(name.shortened, full).toBe(true);
			expect(name.text, full).toMatch(/\S…$/);
			const kept = name.text.slice(0, -1);
			expect(full.startsWith(kept), `${kept} starts ${full}`).toBe(true);
			expect(extent(name).right).toBeLessThan(extent(drawnValue ?? name).left);

			// One more word character, with any space before it, no longer fits beside the value.
			const longer = kept + (full.slice(kept.length).match(/^\s*\S/)?.[0] ?? "");
			expect(firstRow([{ name: `${kept}…`, value }]).name.shortened, `${kept}… fits`).toBe(false);
			expect(firstRow([{ name: `${longer}…`, value }]).name.shortened, `${longer}…`).toBe(true);
		}
	});

	test("has its value shortened too when the value doesn't fit beside the name's first character", () => {
		const full = "eu-west-1, eu-central-1, us-east-1 and ap-south-1";
		const { name, value } = firstRow([{ name: "regions", value: full }]);
		expect(name).toMatchObject({ text: "r…", shortened: true });
		expect(value?.shortened).toBe(true);
		expect(value?.text).toMatch(/\S…$/);
		const kept = value?.text.slice(0, -1) ?? "";
		expect(full.startsWith(kept), `${kept} starts ${full}`).toBe(true);
		expect(extent(name).right).toBeLessThan(extent(value ?? name).left);

		// One more word character of the value no longer fits beside `r…`.
		const longer = kept + (full.slice(kept.length).match(/^\s*\S/)?.[0] ?? "");
		expect(firstRow([{ name: "r…", value: `${kept}…` }]).value?.shortened).toBe(false);
		expect(firstRow([{ name: "r…", value: `${longer}…` }]).value?.shortened).toBe(true);
	});

	test("without a value, has its name shortened to the Node's whole width", () => {
		const full = "Every order line belongs to exactly one order";
		const { name, value } = firstRow([{ name: full }]);
		expect(value).toBeUndefined();
		expect(name.shortened).toBe(true);
		const kept = name.text.slice(0, -1);
		const longer = kept + (full.slice(kept.length).match(/^\s*\S/)?.[0] ?? "");
		expect(firstRow([{ name: `${kept}…` }]).name.shortened).toBe(false);
		expect(firstRow([{ name: `${longer}…` }]).name.shortened).toBe(true);
	});

	test("is drawn inside its Node, each text measured at its drawn width", () => {
		const { node } = withRows([
			...tooWide,
			{ name: "regions", value: "eu-west-1, eu-central-1, us-east-1 and ap-south-1" },
			{ name: "Every order line belongs to exactly one order" },
			{ name: "W".repeat(30), value: "W".repeat(30) },
			{ name: "replicas", value: "3" },
		]);
		for (const { name, value } of node.rows) {
			for (const text of value === undefined ? [name] : [name, value]) {
				expect(text.width, text.text).toBeCloseTo(widthInInterRegular(text.text, text.size), 9);
				expect(extent(text).left, text.text).toBeGreaterThan(node.box.x);
				expect(extent(text).right, text.text).toBeLessThan(node.box.x + node.box.width);
			}
		}
	});

	test("stays whole in the model, and lint warns about each shortened text, naming the Node and its Row", () => {
		const diagram = architecture({ title: "Rows" }, (d) => {
			d.node({ id: "orders-api", kind: "service", title: "Orders API", rows: [{ name: "port" }] });
			d.node({
				id: "orders-db",
				kind: "database",
				title: "Orders database",
				rows: [
					{ name: "replicas", value: "3" },
					{ name: "maximum connections per replica", value: "4000" },
					{ name: "regions", value: "eu-west-1, eu-central-1, us-east-1 and ap-south-1" },
				],
			});
		});
		const before = structuredClone(diagram);

		const { scene, diagnostics } = render(diagram);

		expect(diagram).toEqual(before);
		const rows = nodeOf(scene ?? sceneOf(null), "orders-db").rows;
		const shortened = (at: number, field: "name" | "value", row: string) => ({
			severity: "warning",
			rule: "text-shortened",
			message: `Node \`orders-db\`'s Row \`${row}\` is too wide for its Node, so its ${field} is shortened to \`${rows[at]?.[field]?.text}\`. Choose a shorter name or value to show it in full.`,
			pointer: `/nodes/1/rows/${at}/${field}`,
		});
		expect(diagnostics).toEqual([
			shortened(1, "name", "maximum connections per replica"),
			shortened(2, "name", "regions"),
			shortened(2, "value", "regions"),
		]);
	});
});

describe("a Row's text", () => {
	test("collapses white space as a title's does, before it's measured", () => {
		const { name, value } = firstRow([{ name: "\n read \t replicas ", value: " 4\r\n000 " }]);
		expect(name.text).toBe("read replicas");
		expect(value?.text).toBe("4 000");
		expect(value?.width).toBeCloseTo(widthInInterRegular("4 000", value?.size ?? 0), 9);
	});

	test("with characters the bundled font lacks makes lint warn, naming the Node, the Row and the characters", () => {
		// Inter has none of 東, 京, 大, 阪 and ☃.
		const { diagnostics } = withRows([
			{ name: "東京", value: "☃" },
			{ name: "regions", value: "東京 and 大阪" },
			{ name: "replicas", value: "3" },
		]);
		const lacks = (row: string, some: string, field: string, listed: string) =>
			`Node \`orders-db\`'s Row \`${row}\` has ${some} in its ${field} that the bundled font lacks: ${listed}.`;
		expect(diagnostics).toEqual([
			{
				severity: "warning",
				rule: "glyph-missing",
				message: `${lacks("東京", "characters", "name", "東 (U+6771) and 京 (U+4EAC)")} They're measured at an average width, and drawn in a fallback font.`,
				pointer: "/nodes/0/rows/0/name",
			},
			{
				severity: "warning",
				rule: "glyph-missing",
				message: `${lacks("東京", "a character", "value", "☃ (U+2603)")} It's measured at an average width, and drawn in a fallback font.`,
				pointer: "/nodes/0/rows/0/value",
			},
			{
				severity: "warning",
				rule: "glyph-missing",
				message: `${lacks("regions", "characters", "value", "東 (U+6771), 京 (U+4EAC), 大 (U+5927) and 阪 (U+962A)")} They're measured at an average width, and drawn in a fallback font.`,
				pointer: "/nodes/0/rows/1/value",
			},
		]);
	});
});
