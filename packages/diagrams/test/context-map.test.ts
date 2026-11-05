import { describe, expect, test } from "vitest";
import {
	architecture,
	architectureNotation,
	builderOf,
	domain,
	domainNotation,
	edgeKindsOf,
	type Notation,
	nodeKindsOf,
	render,
} from "../src/index.ts";
import {
	distanceToShapes,
	draw,
	edgeGroupOf,
	linesOf,
	looksOf,
	nodeOf,
	paintsWithin,
	shapesOf,
	strokeOf,
	strokesOf,
} from "./support/drawn.ts";
import { schemaErrors, schemaPointers } from "./support/schema.ts";
import { computedStyle, descendants, isShape, runsOf } from "./support/svg.ts";

/** A shop's Catalog, which Ordering takes its products from. */
const shop = domain({ title: "Shop" }, (d) => {
	const catalog = d.node({ id: "catalog", kind: "context", title: "Catalog" });
	const ordering = d.node({ id: "ordering", kind: "context", title: "Ordering" });
	d.edge(catalog, ordering, { kind: "upstream-downstream" });
});

describe("a context map", () => {
	test("is a domain Diagram whose Nodes are contexts, which the core draws", () => {
		expect(shop).toEqual({
			version: 1,
			notation: "domain",
			title: "Shop",
			direction: "right",
			members: ["catalog", "ordering"],
			nodes: [
				{ id: "catalog", kind: "context", title: "Catalog" },
				{ id: "ordering", kind: "context", title: "Ordering" },
			],
			groups: [],
			edges: [
				{ id: "catalog->ordering", kind: "upstream-downstream", from: "catalog", to: "ordering" },
			],
			walkthroughs: [],
		});

		const { diagnostics, svg } = render(shop);

		expect(diagnostics).toEqual([]);
		expect(svg).toContain('<g data-node="catalog" data-kind="context">');
		expect(svg).toContain(
			'<g data-edge="catalog-&gt;ordering" data-kind="upstream-downstream" data-from="catalog" data-to="ordering">',
		);
		expect(schemaErrors(shop)).toEqual([]);
	});

	test("has no Node Kind but `context`, and four Edge Kinds", () => {
		const service = { ...shop, nodes: [{ ...shop.nodes[0], kind: "service" }, shop.nodes[1]] };
		const call = { ...shop, edges: [{ ...shop.edges[0], kind: "call" }] };

		expect(render(service).diagnostics).toEqual([
			{
				severity: "error",
				rule: "unknown-kind",
				message:
					"Node `catalog` has the Kind `service`, which the domain Notation doesn't have. Its only Node Kind is context.",
				pointer: "/nodes/0/kind",
			},
		]);
		expect(render(call).diagnostics).toEqual([
			{
				severity: "error",
				rule: "unknown-kind",
				message:
					"Edge `catalog->ordering` has the Kind `call`, which the domain Notation doesn't have. Its Edge Kinds are partnership, shared-kernel, upstream-downstream and customer-supplier.",
				pointer: "/edges/0/kind",
			},
		]);
		expect(schemaPointers(service)).toContain("/nodes/0/kind");
		expect(schemaPointers(call)).toContain("/edges/0/kind");
	});

	test("has no Groups, since the domain Notation has no Group Kinds, and the schema agrees", () => {
		const grouped = {
			...shop,
			members: ["sales"],
			groups: [
				{ id: "sales", kind: "subdomain", title: "Sales", members: ["catalog", "ordering"] },
			],
		};

		expect(render(grouped)).toEqual({
			diagnostics: [
				{
					severity: "error",
					rule: "unknown-kind",
					message:
						"Group `sales` has the Kind `subdomain`, which the domain Notation doesn't have. It has no Group Kinds.",
					pointer: "/groups/0/kind",
				},
			],
		});
		expect(schemaPointers(grouped)).toContain("/groups/0/kind");
	});
});

/**
 * Five contexts in a row, joined by one Edge of each Kind: two partners, a
 * kernel shared, an upstream and its downstream, and a supplier and its
 * customer.
 */
const relations = domain({ title: "Relations" }, (d) => {
	const sales = d.node({ id: "sales", kind: "context", title: "Sales" });
	const support = d.node({ id: "support", kind: "context", title: "Support" });
	const catalog = d.node({ id: "catalog", kind: "context", title: "Catalog" });
	const ordering = d.node({ id: "ordering", kind: "context", title: "Ordering" });
	const shipping = d.node({ id: "shipping", kind: "context", title: "Shipping" });
	d.edge(sales, support, { kind: "partnership" });
	d.edge(support, catalog, { kind: "shared-kernel" });
	d.edge(catalog, ordering, { kind: "upstream-downstream" });
	d.edge(ordering, shipping, { kind: "customer-supplier" });
});

describe("a context map's Edges", () => {
	test("are drawn without an arrowhead or chevrons when their Kind is symmetric, and each Kind looks different", () => {
		const drawn = draw(relations);
		const drawing = drawn.scene.edges.map((edge) => {
			const lines = linesOf(drawn, edge);
			const marks = descendants(edgeGroupOf(drawn, edge.id)).filter(
				(shape) => isShape(shape) && !lines.includes(shape),
			);
			const { point } = edge.toPort;
			return {
				kind: edge.kind,
				dashes: [...new Set(lines.map((line) => strokeOf(drawn, line, "light").dashes))],
				chevrons: edge.chevrons.length,
				// Besides its casing and its body: its chevrons, cased alike, and its arrowhead.
				marks: marks.length,
				// How far its line stops short of its target's Port, inside an arrowhead.
				short: Math.min(
					...lines
						.flatMap(runsOf)
						.flat()
						.map((at) => Math.hypot(at.x - point.x, at.y - point.y)),
				),
			};
		});

		expect(drawing).toEqual([
			{ kind: "partnership", dashes: ["none"], chevrons: 0, marks: 0, short: 0 },
			{ kind: "shared-kernel", dashes: ["6 4"], chevrons: 0, marks: 0, short: 0 },
			{ kind: "upstream-downstream", dashes: ["none"], chevrons: 1, marks: 3, short: 7 },
			{ kind: "customer-supplier", dashes: ["6 4"], chevrons: 1, marks: 3, short: 7 },
		]);
	});

	test("join only contexts, whatever other Node Kinds the Notation comes to have", () => {
		/** The domain Notation with a Node Kind that isn't a context, as a ticket that adds one would change it. */
		const withTeams = {
			...domainNotation,
			nodeKinds: {
				...domainNotation.nodeKinds,
				team: {
					width: 176,
					height: 48,
					outline: "rounded",
					badge: "M 3 3 H 13 V 13 H 3 Z",
					hue: "context",
				},
			},
		} as const satisfies Notation;
		const joined = (kind: string, from: string, to: string) => ({
			...shop,
			members: ["catalog", "platform-team"],
			nodes: [shop.nodes[0], { id: "platform-team", kind: "team", title: "Platform team" }],
			edges: [{ id: "joint", kind, from, to }],
		});

		for (const kind of edgeKindsOf(domainNotation)) {
			expect(
				render(joined(kind, "catalog", "platform-team"), { notations: [withTeams] }).diagnostics,
				kind,
			).toEqual([
				{
					severity: "error",
					rule: "edge-end-kind",
					message: `Edge \`joint\` ends at \`platform-team\`, whose Kind is \`team\`. An Edge of the Kind \`${kind}\` may end only at a Node of the Kind \`context\`.`,
					pointer: "/edges/0/to",
				},
			]);
			expect(
				render(joined(kind, "platform-team", "catalog"), { notations: [withTeams] }).diagnostics,
				kind,
			).toEqual([
				{
					severity: "error",
					rule: "edge-end-kind",
					message: `Edge \`joint\` starts at \`platform-team\`, whose Kind is \`team\`. An Edge of the Kind \`${kind}\` may start only at a Node of the Kind \`context\`.`,
					pointer: "/edges/0/from",
				},
			]);
		}
		expect(edgeKindsOf(domainNotation)).toHaveLength(4);
	});

	test("may carry a label, which the drawing and the description show, but no Technology and no rate", () => {
		const labeled = domain({ title: "Shop" }, (d) => {
			const catalog = d.node({ id: "catalog", kind: "context", title: "Catalog" });
			const ordering = d.node({ id: "ordering", kind: "context", title: "Ordering" });
			d.edge(catalog, ordering, { kind: "upstream-downstream", label: "Product data" });
		});
		const drawn = draw(labeled);

		expect(render(labeled).diagnostics).toEqual([]);
		expect(schemaErrors(labeled)).toEqual([]);
		expect(drawn.scene.edges[0]?.label?.text?.text).toBe("Product data");
		expect(drawn.root.children.find((child) => child.name === "desc")?.text).toBe(
			"Nodes: Catalog (context); Ordering (context). Edges: Catalog is upstream of Ordering: Product data.",
		);

		const carried = {
			...labeled,
			edges: [{ ...labeled.edges[0], technology: "kafka", rate: "2k/s" }],
		};
		expect(render(carried).diagnostics).toEqual(
			["technology", "rate"].map((field) => ({
				severity: "error",
				rule: "model-shape",
				message: `\`/edges/0/${field}\` must be left out: an Edge has no such field in the domain Notation. Its fields are \`id\`, \`kind\`, \`from\`, \`to\` and \`label\`.`,
				pointer: `/edges/0/${field}`,
			})),
		);
	});

	test("are each described in their Kind's sentence form", () => {
		const { root } = draw(relations);

		expect(root.children.find((child) => child.name === "desc")?.text).toBe(
			"Nodes: Sales (context); Support (context); Catalog (context); Ordering (context); Shipping (context). Edges: Sales and Support are partners. Support and Catalog share a kernel. Catalog is upstream of Ordering. Ordering supplies Shipping.",
		);
	});
});

describe("a context", () => {
	test("is drawn as an oval that fills its Node's rectangle, which no architecture Kind is", () => {
		const drawn = draw(shop);
		for (const { id, box } of drawn.scene.nodes) {
			const tinted = shapesOf(drawn, id).filter((shape) => shape.attributes.has("fill-opacity"));
			expect(tinted, id).toHaveLength(1);
			const [silhouette] = tinted;
			const width = Number(silhouette?.attributes.get("stroke-width"));
			const points = silhouette === undefined ? [] : runsOf(silhouette).flat();
			expect(points.length, id).toBeGreaterThan(32);
			// Every point of its outline lies on the ellipse inside its box, half a stroke in.
			const [a, b] = [(box.width - width) / 2, (box.height - width) / 2];
			const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
			for (const { x, y } of points) {
				const onEllipse = ((x - center.x) / a) ** 2 + ((y - center.y) / b) ** 2;
				expect(Math.abs(onEllipse - 1), `${id} at (${x}, ${y})`).toBeLessThan(0.01);
			}
			// It reaches the middle of each side, where its Ports are, whichever way it's laid out.
			const xs = points.map(({ x }) => x);
			const ys = points.map(({ y }) => y);
			expect(
				[Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map(Math.round),
				id,
			).toEqual([box.x + 1, box.x + box.width - 1, box.y + 1, box.y + box.height - 1]);
		}
	});

	test.each(["right", "down"] as const)(
		"keeps its outline on its Node's sides at every Port, were it to have Rows, laid out %s",
		(direction) => {
			/** The domain Notation as a ticket that gives its Nodes Rows would change it. */
			const withRows = {
				...domainNotation,
				fields: { ...domainNotation.fields, node: [...domainNotation.fields.node, "rows"] },
			} as const satisfies Notation;
			const contexts = builderOf(withRows)({ title: "Rows", direction }, (d) => {
				for (const count of [0, 1, 3]) {
					const rows = Array.from({ length: count }, (_, at) => ({ name: `row ${at}` }));
					d.node({ id: `context-${count}`, kind: "context", title: "Shop", rows });
				}
			});
			const drawn = draw(contexts, { notations: [withRows] });

			for (const node of drawn.scene.nodes) {
				const outline = shapesOf(drawn, node.id).filter(
					(shape) =>
						computedStyle(shape, drawn.rules, "light").get("stroke") !== "none" &&
						!paintsWithin(drawn, shape, node.badge),
				);
				const runs = outline.flatMap(runsOf);
				const ports = [
					node.input,
					node.output,
					...node.rows.flatMap((row) => [row.input, row.output]),
				];
				expect(ports, node.id).toHaveLength(2 + 2 * node.rows.length);
				for (const { side, point } of ports) {
					// The stroke's outer edge reaches the Port, give or take half a pixel.
					expect(
						distanceToShapes(point, runs),
						`${node.id}, ${side} Port at ${point.y}`,
					).toBeLessThanOrEqual(1.5 / 2 + 0.5);
				}
				for (const shape of shapesOf(drawn, node.id)) {
					expect(paintsWithin(drawn, shape, node.box), `${node.id}: <${shape.name}>`).toBe(true);
				}
			}
		},
	);

	test("that we don't own is marked External, drawn with a dashed outline, and described so", () => {
		const payments = domain({ title: "Payments" }, (d) => {
			const billing = d.node({ id: "billing", kind: "context", title: "Billing" });
			const provider = d.node({
				id: "card-payments",
				kind: "context",
				title: "Card payments",
				external: true,
			});
			d.edge(provider, billing, { kind: "upstream-downstream" });
		});
		const drawn = draw(payments);
		/** How a context's outline is dashed, and its badge: the dashes of each stroke outside and inside its badge's box. */
		const dashes = (id: string) => {
			const { badge } = nodeOf(drawn.scene, id);
			const stroked = shapesOf(drawn, id).filter(
				(shape) => computedStyle(shape, drawn.rules, "light").get("stroke") !== "none",
			);
			const of = (shapes: typeof stroked) => [
				...new Set(shapes.map((shape) => strokeOf(drawn, shape, "light").dashes)),
			];
			return {
				outline: of(stroked.filter((shape) => !paintsWithin(drawn, shape, badge))),
				badge: of(stroked.filter((shape) => paintsWithin(drawn, shape, badge))),
			};
		};

		expect(payments.nodes[1]).toEqual({
			id: "card-payments",
			kind: "context",
			title: "Card payments",
			external: true,
		});
		expect(drawn.scene.nodes.map(({ id, external }) => [id, external])).toEqual([
			["billing", false],
			["card-payments", true],
		]);
		expect(dashes("billing")).toEqual({ outline: ["none"], badge: ["none"] });
		expect(dashes("card-payments")).toEqual({ outline: ["6 3.75"], badge: ["none"] });
		expect(drawn.root.children.find((child) => child.name === "desc")?.text).toBe(
			"Nodes: Billing (context); Card payments (context, External). Edges: Card payments is upstream of Billing.",
		);
		expect(schemaErrors(payments)).toEqual([]);
	});

	test("may carry a description and Links, which aren't drawn, and nothing that only an architecture Node has", () => {
		const described = domain({ title: "Shop" }, (d) => {
			d.node({
				id: "billing",
				kind: "context",
				title: "Billing",
				description: "Invoices orders, and collects what's owed.",
				links: [{ id: "ordering" }, { doc: "docs/billing.md", section: "Invoices" }],
			});
			d.node({ id: "ordering", kind: "context", title: "Ordering" });
		});
		const plain = {
			...described,
			nodes: [{ id: "billing", kind: "context", title: "Billing" }, described.nodes[1]],
		};
		const { diagnostics, svg = "" } = render(described);

		expect(diagnostics).toEqual([]);
		expect(schemaErrors(described)).toEqual([]);
		// Only the model that the SVG carries tells the two apart.
		const changed = svg
			.split("\n")
			.filter((line, at) => line !== render(plain).svg?.split("\n")[at]);
		expect(changed.map((line) => line.trim().slice(0, 10))).toEqual(["<metadata>"]);

		const architectural = {
			...plain,
			nodes: [
				{
					...plain.nodes[0],
					technology: "go",
					status: "ok",
					rows: [{ name: "team", value: "Payments" }],
					callout: "legacy",
				},
				plain.nodes[1],
			],
		};
		const fields = "`id`, `kind`, `title`, `external`, `description` and `links`";
		expect(render(architectural).diagnostics).toEqual(
			["technology", "status", "rows", "callout"].map((field) => ({
				severity: "error",
				rule: "model-shape",
				message: `\`/nodes/0/${field}\` must be left out: a Node has no such field in the domain Notation. Its fields are ${fields}.`,
				pointer: `/nodes/0/${field}`,
			})),
		);
	});

	test("is bigger than an architecture service, and its size is in whole steps of 16 px", () => {
		const { box } = nodeOf(draw(shop).scene, "catalog");
		const service = architectureNotation.nodeKinds.service;

		expect([box.width, box.height]).toEqual([192, 64]);
		expect(box.width).toBeGreaterThan(service.width);
		expect(box.height).toBeGreaterThan(service.height);
	});

	test("has a badge that differs from every architecture Kind's, without color", () => {
		const kinds = nodeKindsOf(architectureNotation);
		const everyKind = draw(
			architecture({ title: "Kinds" }, (d) => {
				for (const kind of kinds) {
					d.node({ id: kind, kind, title: "Shop" });
				}
			}),
		);
		const { badge } = looksOf(draw(shop), "catalog");

		expect(badge).not.toBe("");
		expect(kinds.filter((kind) => looksOf(everyKind, kind).badge === badge)).toEqual([]);
	});

	test("is drawn in the context hue, a color of the theme that a page can set", () => {
		const drawn = draw(shop);
		const scope = `.${drawn.root.attributes.get("class")} `;
		const hueRules = drawn.rules
			.filter(({ selectors }) => selectors.some((selector) => selector.includes("[data-node]")))
			.map((rule) => [
				rule.dark ? "dark" : "light",
				rule.selectors.map((selector) => selector.replace(scope, "")),
				rule.declarations,
			]);

		expect([...strokesOf(drawn, "catalog", "light")]).toEqual(["#4f55c8"]);
		expect([...strokesOf(drawn, "catalog", "dark")]).toEqual(["#8f96f5"]);
		expect(hueRules).toEqual([
			[
				"light",
				['[data-node][data-kind="context"]'],
				[["color", "var(--diagram-hue-context, #4f55c8)"]],
			],
			[
				"dark",
				['[data-node][data-kind="context"]'],
				[["color", "var(--diagram-hue-context, #8f96f5)"]],
			],
		]);
	});
});
