import { describe, expect, test } from "vitest";
import {
	architecture,
	architectureNotation,
	type Box,
	builderOf,
	domain,
	domainNotation,
	edgeKindsOf,
	type Notation,
	nodeKindsOf,
	type Point,
	render,
} from "../src/index.ts";
import { contextMap } from "./fixtures/context-map.ts";
import {
	distanceToShapes,
	draw,
	edgeGroupOf,
	linesOf,
	looksOf,
	nodeOf,
	paintsWithin,
	sceneOf,
	shapesOf,
	strokeOf,
	strokesOf,
} from "./support/drawn.ts";
import { everyFixture } from "./support/fixtures.ts";
import { schema, schemaErrors, schemaPointers } from "./support/schema.ts";
import { computedStyle, descendants, isShape, paintedBounds, runsOf } from "./support/svg.ts";

const fixtures = await everyFixture();

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
				message: `\`/edges/0/${field}\` must be left out: an Edge has no such field in the domain Notation. Its fields are \`id\`, \`kind\`, \`from\`, \`to\`, \`label\` and \`roles\`.`,
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

/** The shop's Catalog and Ordering, with an Edge between them that carries the roles given. */
function withRoles(kind: string, roles: unknown) {
	return { ...shop, edges: [{ ...shop.edges[0], kind, roles }] };
}

describe("the roles at the ends of a context map's Edge", () => {
	test("are part of the model, which the builder writes as given and the schema passes", () => {
		const tagged = domain({ title: "Shop" }, (d) => {
			const catalog = d.node({ id: "catalog", kind: "context", title: "Catalog" });
			const ordering = d.node({ id: "ordering", kind: "context", title: "Ordering" });
			const billing = d.node({ id: "billing", kind: "context", title: "Billing" });
			d.edge(catalog, ordering, {
				kind: "upstream-downstream",
				roles: { from: ["OHS", "PL"], to: ["ACL"] },
			});
			d.edge(ordering, billing, { kind: "customer-supplier", roles: { to: ["CF"] } });
			d.edge(catalog, billing, { kind: "upstream-downstream", roles: { from: ["PL"] } });
		});

		expect(tagged.edges).toEqual([
			{
				id: "catalog->ordering",
				kind: "upstream-downstream",
				from: "catalog",
				to: "ordering",
				roles: { from: ["OHS", "PL"], to: ["ACL"] },
			},
			{
				id: "ordering->billing",
				kind: "customer-supplier",
				from: "ordering",
				to: "billing",
				roles: { to: ["CF"] },
			},
			{
				id: "catalog->billing",
				kind: "upstream-downstream",
				from: "catalog",
				to: "billing",
				roles: { from: ["PL"] },
			},
		]);
		expect(render(tagged).diagnostics).toEqual([]);
		expect(schemaErrors(tagged)).toEqual([]);
	});

	test("are each one of the Notation's roles, where the schema agrees", () => {
		const misspelled = withRoles("upstream-downstream", { from: ["OHS", "PLS"], to: ["acl"] });

		expect(render(misspelled).diagnostics).toEqual([
			{
				severity: "error",
				rule: "unknown-role",
				message:
					"Edge `catalog->ordering` has the role `PLS` at its `from` end, which the domain Notation doesn't have. Its roles are OHS, PL, CF and ACL.",
				pointer: "/edges/0/roles/from/1",
			},
			{
				severity: "error",
				rule: "unknown-role",
				message:
					"Edge `catalog->ordering` has the role `acl` at its `to` end, which the domain Notation doesn't have. Its roles are OHS, PL, CF and ACL.",
				pointer: "/edges/0/roles/to/0",
			},
		]);
		expect(schemaPointers(misspelled)).toEqual(
			expect.arrayContaining(["/edges/0/roles/from/1", "/edges/0/roles/to/0"]),
		);
	});

	test("sit only at the end that their Edge's Kind lets carry them, which the schema can't express", () => {
		const swapped = withRoles("upstream-downstream", { from: ["CF"], to: ["OHS", "ACL"] });

		expect(render(swapped).diagnostics).toEqual([
			{
				severity: "error",
				rule: "edge-end-role",
				message:
					"Edge `catalog->ordering` has the role `CF` at its `from` end. An Edge of the Kind `upstream-downstream` may carry `CF` only at its `to` end.",
				pointer: "/edges/0/roles/from/0",
			},
			{
				severity: "error",
				rule: "edge-end-role",
				message:
					"Edge `catalog->ordering` has the role `OHS` at its `to` end. An Edge of the Kind `upstream-downstream` may carry `OHS` only at its `from` end.",
				pointer: "/edges/0/roles/to/0",
			},
		]);
		expect(schemaErrors(swapped)).toEqual([]);
		expect(schema.description).toContain("`edge-end-role`");
	});

	test("let the downstream end conform or keep the upstream's model out, never both, while the upstream end may do both", () => {
		const both = withRoles("customer-supplier", { from: ["OHS", "PL"], to: ["CF", "ACL"] });

		expect(render(both).diagnostics).toEqual([
			{
				severity: "error",
				rule: "edge-end-role",
				message:
					"Edge `catalog->ordering` has both `CF` and `ACL` at its `to` end. An Edge of the Kind `customer-supplier` may carry only one of them there.",
				pointer: "/edges/0/roles/to",
			},
		]);
		expect(schemaErrors(both)).toEqual([]);
		for (const one of ["CF", "ACL"]) {
			const either = withRoles("customer-supplier", { from: ["PL", "OHS"], to: [one] });
			expect(render(either).diagnostics, one).toEqual([]);
		}
	});

	test("aren't carried by a symmetric Edge, whose ends are alike", () => {
		for (const kind of ["partnership", "shared-kernel"]) {
			for (const roles of [{ from: ["OHS", "PL"], to: ["ACL"] }, { to: ["CF"] }]) {
				const tagged = withRoles(kind, roles);

				expect(render(tagged).diagnostics, kind).toEqual([
					{
						severity: "error",
						rule: "edge-end-role",
						message: `Edge \`catalog->ordering\` has roles, but its Kind, \`${kind}\`, is symmetric: its two ends are alike, so it takes no roles.`,
						pointer: "/edges/0/roles",
					},
				]);
				expect(schemaErrors(tagged), kind).toEqual([]);
			}
			// Roles that list no role are no roles.
			expect(render(withRoles(kind, {})).diagnostics, kind).toEqual([]);
			expect(render(withRoles(kind, { from: [], to: [] })).diagnostics, kind).toEqual([]);
		}
	});

	test("are written as a list for each end, under the end's name, where the schema agrees", () => {
		const cases: [roles: unknown, pointer: string, message: string][] = [
			[["OHS"], "/edges/0/roles", "`/edges/0/roles` must be an object."],
			[{ from: "OHS" }, "/edges/0/roles/from", "`/edges/0/roles/from` must be a list."],
			[{ to: [7] }, "/edges/0/roles/to/0", "`/edges/0/roles/to/0` must be a string."],
			[
				{ upstream: ["OHS"] },
				"/edges/0/roles/upstream",
				"`/edges/0/roles/upstream` must be left out: an Edge's `roles` has no such field. Its fields are `from` and `to`.",
			],
		];
		for (const [roles, pointer, message] of cases) {
			const model = withRoles("upstream-downstream", roles);

			expect(render(model).diagnostics, pointer).toEqual([
				{ severity: "error", rule: "model-shape", message, pointer },
			]);
			expect(schemaPointers(model), pointer).toContain(pointer);
		}
	});

	test("are each listed once at an end, where the schema agrees", () => {
		const twice = withRoles("upstream-downstream", { from: ["OHS", "PL", "OHS"] });

		expect(render(twice).diagnostics).toEqual([
			{
				severity: "error",
				rule: "edge-end-role",
				message:
					"Edge `catalog->ordering` lists the role `OHS` twice at its `from` end. List each role once.",
				pointer: "/edges/0/roles/from",
			},
		]);
		expect(schemaPointers(twice)).toContain("/edges/0/roles/from");
	});

	test("are the domain Notation's alone: an architecture Edge has no such field", () => {
		const shopSystem = architecture({ title: "Shop" }, (d) => {
			const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
			const db = d.node({ id: "shop-db", kind: "database", title: "Shop database" });
			d.edge(api, db, { kind: "call" });
		});
		const tagged = { ...shopSystem, edges: [{ ...shopSystem.edges[0], roles: { from: ["OHS"] } }] };

		expect(render(tagged).diagnostics).toEqual([
			{
				severity: "error",
				rule: "model-shape",
				message:
					"`/edges/0/roles` must be left out: an Edge has no such field in the architecture Notation. Its fields are `id`, `kind`, `from`, `to`, `label`, `technology` and `rate`.",
				pointer: "/edges/0/roles",
			},
		]);
		expect(schemaPointers(tagged)).toContain("/edges/0/roles");
	});

	test("are an option that the builder checks: one that it doesn't know is an error, not left out", () => {
		const misspelled = domain({ title: "Shop" }, (d) => {
			const catalog = d.node({ id: "catalog", kind: "context", title: "Catalog" });
			const ordering = d.node({ id: "ordering", kind: "context", title: "Ordering" });
			const roles = { form: ["OHS"], to: ["ACL"] } as { to: ["ACL"] };
			d.edge(catalog, ordering, { kind: "upstream-downstream", roles });
		});
		const architectural = architecture({ title: "Shop" }, (d) => {
			const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
			const db = d.node({ id: "shop-db", kind: "database", title: "Shop database" });
			const options = { kind: "call", roles: { from: ["OHS"] } } as { kind: "call" };
			d.edge(api, db, options);
		});

		expect(misspelled.edges[0]?.roles).toEqual({ to: ["ACL"] });
		expect(render(misspelled).diagnostics).toEqual([
			{
				severity: "error",
				rule: "model-shape",
				message: "An Edge's `roles` has no option `form`. Its options are `from` and `to`.",
				pointer: "/edges/0/roles/form",
			},
		]);
		expect(render(architectural).diagnostics).toEqual([
			{
				severity: "error",
				rule: "model-shape",
				message:
					"An Edge has no option `roles` in the architecture Notation. Its options are `kind`, `id`, `label`, `technology` and `rate`.",
				pointer: "/edges/0/roles",
			},
		]);
	});

	test("are copied into the model, so a shared definition never changes with it", () => {
		const upstream = { from: ["OHS", "PL"] } as const;
		const tagged = domain({ title: "Shop" }, (d) => {
			const catalog = d.node({ id: "catalog", kind: "context", title: "Catalog" });
			const ordering = d.node({ id: "ordering", kind: "context", title: "Ordering" });
			d.edge(catalog, ordering, { kind: "upstream-downstream", roles: upstream });
		});

		expect(tagged.edges[0]?.roles).toEqual({ from: ["OHS", "PL"] });
		expect(tagged.edges[0]?.roles?.from).not.toBe(upstream.from);
	});

	test("are named in the SVG's description, each in full, after the title of its end's context", () => {
		const tagged = domain({ title: "Shop" }, (d) => {
			const catalog = d.node({ id: "catalog", kind: "context", title: "Catalog" });
			const ordering = d.node({ id: "ordering", kind: "context", title: "Ordering" });
			const billing = d.node({ id: "billing", kind: "context", title: "Billing" });
			d.edge(catalog, ordering, {
				kind: "upstream-downstream",
				label: "Product data",
				roles: { from: ["OHS", "PL"], to: ["ACL"] },
			});
			d.edge(ordering, billing, { kind: "customer-supplier", roles: { to: ["CF"] } });
			d.edge(catalog, billing, { kind: "upstream-downstream", roles: { from: ["PL"], to: [] } });
		});
		const { root } = draw(tagged);

		expect(root.children.find((child) => child.name === "desc")?.text).toBe(
			"Nodes: Catalog (context); Ordering (context); Billing (context). Edges: Catalog (open host service, published language) is upstream of Ordering (anticorruption layer): Product data. Ordering supplies Billing (conformist). Catalog (published language) is upstream of Billing.",
		);
	});
});

/** The shop's Catalog upstream of its Ordering, with roles at both ends of the Edge between them. */
const tagged = domain({ title: "Shop" }, (d) => {
	const catalog = d.node({ id: "catalog", kind: "context", title: "Catalog" });
	const ordering = d.node({ id: "ordering", kind: "context", title: "Ordering" });
	d.edge(catalog, ordering, {
		kind: "upstream-downstream",
		roles: { from: ["OHS", "PL"], to: ["ACL"] },
	});
});

describe("a role tag", () => {
	test("sits on its Edge's line: the upstream end's by the source, in the model's order, and the downstream end's by the target", () => {
		const { scene } = draw(tagged);
		const [edge] = scene.edges;
		const catalog = nodeOf(scene, "catalog").box;
		const ordering = nodeOf(scene, "ordering").box;
		const roles = edge?.roles ?? [];

		expect(roles.map(({ end, role, text }) => [end, role, text.text])).toEqual([
			["from", "OHS", "OHS"],
			["from", "PL", "PL"],
			["to", "ACL", "ACL"],
		]);
		// The Edge runs straight from Catalog's Port to Ordering's, and each tag is centered on it.
		const line = edge?.fromPort.point.y;
		expect(edge?.route.map(({ y }) => y)).toEqual([line, line]);
		for (const { role, tag, text } of roles) {
			expect(tag.y + tag.height / 2, role).toBe(line);
			expect(text.point, role).toEqual({ x: tag.x + tag.width / 2, y: line });
			expect(text.shortened, role).toBe(false);
			expect(tag.width, role).toBeGreaterThan(text.width);
			expect(tag.height, role).toBeGreaterThan(text.size);
		}
		// From the source: OHS, then PL, then a stretch of bare line, then ACL, short of the target.
		const [ohs, pl, acl] = roles.map(({ tag }) => tag);
		const stops = [
			catalog.x + catalog.width,
			ohs?.x,
			(ohs?.x ?? 0) + (ohs?.width ?? 0),
			pl?.x,
			(pl?.x ?? 0) + (pl?.width ?? 0),
			acl?.x,
			(acl?.x ?? 0) + (acl?.width ?? 0),
			ordering.x,
		];
		expect(stops).toEqual([...stops].sort((a, b) => (a ?? 0) - (b ?? 0)));
		expect(new Set(stops).size).toBe(stops.length);
		const middle = (catalog.x + catalog.width + ordering.x) / 2;
		expect((pl?.x ?? 0) + (pl?.width ?? 0)).toBeLessThan(middle);
		expect(acl?.x).toBeGreaterThan(middle);
		// The tags of one end sit closer to each other than the two ends' tags do.
		expect((acl?.x ?? 0) - ((pl?.x ?? 0) + (pl?.width ?? 0))).toBeGreaterThanOrEqual(16);
	});

	test("is drawn where the scene puts it, over the Edges and beneath the Nodes: a box around the role, which carries its Edge, its end and its role", () => {
		const drawn = draw(tagged);
		const all = descendants(drawn.root);
		const groups = all.filter((element) => element.attributes.has("data-edge-role"));
		const roles = drawn.scene.edges[0]?.roles ?? [];

		expect(
			groups.map((group) =>
				["data-edge-role", "data-end", "data-role"].map((name) => group.attributes.get(name)),
			),
		).toEqual([
			["catalog->ordering", "from", "OHS"],
			["catalog->ordering", "from", "PL"],
			["catalog->ordering", "to", "ACL"],
		]);
		groups.forEach((group, at) => {
			const role = roles[at];
			const [box, ...rest] = group.children.filter(isShape);
			const texts = group.children.filter((child) => child.name === "text");
			expect(rest, role?.role).toEqual([]);
			expect(
				texts.map((text) => text.text),
				role?.role,
			).toEqual([role?.role]);
			// The box paints the whole of the scene's tag, its border included.
			const painted = box === undefined ? undefined : paintedBounds(box, drawn.rules, "light");
			expect(painted, role?.role).toEqual({
				left: role?.tag.x,
				top: role?.tag.y,
				right: (role?.tag.x ?? 0) + (role?.tag.width ?? 0),
				bottom: (role?.tag.y ?? 0) + (role?.tag.height ?? 0),
			});
			const [text] = texts;
			expect(
				["x", "y", "font-size", "font-weight", "text-anchor", "dominant-baseline"].map((name) =>
					text?.attributes.get(name),
				),
				role?.role,
			).toEqual([
				String(role?.text.point.x),
				String(role?.text.point.y),
				"10",
				"600",
				"middle",
				"central",
			]);
		});
		// Tags are drawn after the last Edge, and before the first Node.
		const at = (name: string) =>
			all.flatMap((element, index) => (element.attributes.has(name) ? [index] : []));
		expect(Math.max(...at("data-edge"))).toBeLessThan(Math.min(...at("data-edge-role")));
		expect(Math.max(...at("data-edge-role"))).toBeLessThan(Math.min(...at("data-node")));
	});

	test("leaves its Edge's chevron the middle of the bare line between the two ends' tags", () => {
		const { scene } = draw(tagged);
		const [edge] = scene.edges;
		const [, pl, acl] = (edge?.roles ?? []).map(({ tag }) => tag);
		const bare = { from: (pl?.x ?? 0) + (pl?.width ?? 0), to: acl?.x ?? 0 };

		expect(edge?.chevrons).toHaveLength(1);
		expect(edge?.chevrons[0]?.point).toEqual({
			x: (bare.from + bare.to) / 2,
			y: edge?.fromPort.point.y,
		});
		expect(bare.to - bare.from).toBeGreaterThanOrEqual(scene.roleSpacing.between);
	});

	test("leaves its Edge's label the bare line between the two ends' tags, where layout makes room for all three", () => {
		const labeled = {
			...tagged,
			edges: [{ ...tagged.edges[0], label: "Product data" }],
		};
		const { scene, diagnostics } = render(labeled);
		const [edge] = scene?.edges ?? [];
		const [, pl, acl] = (edge?.roles ?? []).map(({ tag }) => tag);
		const label = edge?.label;

		expect(diagnostics).toEqual([]);
		expect(label?.text?.text).toBe("Product data");
		expect(label?.text?.shortened).toBe(false);
		expect(label?.box.x).toBeGreaterThanOrEqual((pl?.x ?? 0) + (pl?.width ?? 0));
		expect((label?.box.x ?? 0) + (label?.box.width ?? 0)).toBeLessThanOrEqual(acl?.x ?? 0);
		// The Nodes stand further apart than they do without the label.
		const apart = (nodes: { box: Box }[] = []) =>
			(nodes[1]?.box.x ?? 0) - (nodes[0]?.box.x ?? 0) - (nodes[0]?.box.width ?? 0);
		expect(apart(scene?.nodes)).toBeGreaterThan(apart(render(tagged).scene?.nodes));
		expect(apart(render(tagged).scene?.nodes)).toBeGreaterThan(apart(render(shop).scene?.nodes));
	});

	test("is drawn just past its Port's stub, with a warning, when its Edge has no line of its own", () => {
		// Two Edges between the same two contexts, drawn along one simple route.
		const twice = domain({ title: "Shop" }, (d) => {
			const catalog = d.node({ id: "catalog", kind: "context", title: "Catalog" });
			const ordering = d.node({ id: "ordering", kind: "context", title: "Ordering" });
			d.edge(catalog, ordering, {
				kind: "upstream-downstream",
				id: "products",
				roles: { from: ["OHS"], to: ["CF"] },
			});
			d.edge(catalog, ordering, { kind: "customer-supplier", id: "prices" });
		});
		const { scene, diagnostics } = render(twice, { searchBudget: 1 });
		const noRoom = (role: string, end: string) => ({
			severity: "warning",
			rule: "role-placement",
			message: `Edge \`products\`'s role \`${role}\` has no room on the Edge's own line near its \`${end}\` end, clear of Nodes, Group labels and other role tags. So its tag is drawn there anyway, and may cover them.`,
			pointer: `/edges/0/roles/${end}/0`,
		});

		expect(scene?.edges.map(({ fellBack }) => fellBack)).toEqual([true, true]);
		expect(diagnostics.filter(({ rule }) => rule === "role-placement")).toEqual([
			noRoom("OHS", "from"),
			noRoom("CF", "to"),
		]);
		const [products] = scene?.edges ?? [];
		const [ohs, cf] = (products?.roles ?? []).map(({ tag }) => tag);
		const stub = (port?: { point: Point; stub: Point }) =>
			Math.abs((port?.stub.x ?? 0) - (port?.point.x ?? 0));
		expect(stub(products?.fromPort)).toBe(16);
		expect(ohs?.x).toBe((products?.fromPort.stub.x ?? 0) + 4);
		expect((cf?.x ?? 0) + (cf?.width ?? 0)).toBe((products?.toPort.stub.x ?? 0) - 4);
	});

	test("that has no room still comes after its end's tag before it, rather than on it", () => {
		// A context with an Edge back to another and a loop to itself, laid out down. Both leave
		// its Port side by side, and the first one's tags take the room that the loop's would.
		const crowded = domain({ title: "Loop", direction: "down" }, (d) => {
			const catalog = d.node({ id: "catalog", kind: "context", title: "Catalog" });
			const ordering = d.node({ id: "ordering", kind: "context", title: "Ordering" });
			d.edge(catalog, ordering, { kind: "upstream-downstream" });
			d.edge(ordering, catalog, {
				kind: "upstream-downstream",
				id: "back",
				roles: { from: ["PL", "OHS"], to: ["CF"] },
			});
			d.edge(ordering, ordering, {
				kind: "upstream-downstream",
				id: "loop",
				roles: { from: ["PL", "OHS"], to: ["ACL"] },
			});
		});
		const { scene, diagnostics } = render(crowded);
		const loop = scene?.edges.find(({ id }) => id === "loop");
		const [pl, ohs] = (loop?.roles ?? []).map(({ tag }) => tag);

		expect(diagnostics.map(({ rule, pointer }) => [rule, pointer])).toEqual([
			["role-placement", "/edges/2/roles/from/1"],
		]);
		expect(loop?.roles.map(({ end, role }) => `${end} ${role}`)).toEqual([
			"from PL",
			"from OHS",
			"to ACL",
		]);
		// Both sit on the loop's run across, the second one past the first.
		expect(pl?.y).toBe(ohs?.y);
		expect(ohs?.x).toBeGreaterThanOrEqual((pl?.x ?? 0) + (pl?.width ?? 0));
	});

	/** Whether two boxes overlap, more than touching. */
	const overlap = (a: Box, b: Box) =>
		a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
	/** Whether a route runs through a box: one of its runs passes inside it. */
	const runsThrough = (route: Point[], box: Box) =>
		route.slice(1).some((to, index) => {
			const from = route[index] ?? to;
			return (
				Math.min(from.x, to.x) < box.x + box.width &&
				Math.max(from.x, to.x) > box.x &&
				Math.min(from.y, to.y) < box.y + box.height &&
				Math.max(from.y, to.y) > box.y
			);
		});
	/** How far along a route, as a share of its length, the point of it nearest to a point lies. */
	const shareAlong = (route: Point[], point: Point) => {
		let [length, nearest, at] = [0, Number.POSITIVE_INFINITY, 0];
		route.slice(1).forEach((to, index) => {
			const from = route[index] ?? to;
			const x = Math.max(Math.min(from.x, to.x), Math.min(point.x, Math.max(from.x, to.x)));
			const y = Math.max(Math.min(from.y, to.y), Math.min(point.y, Math.max(from.y, to.y)));
			const distance = Math.hypot(point.x - x, point.y - y);
			if (distance < nearest) {
				nearest = distance;
				at = length + Math.abs(x - from.x) + Math.abs(y - from.y);
			}
			length += Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
		});
		return at / length;
	};

	describe("in every fixture", () => {
		/** Each fixture's scene, with the tags of its Edges. */
		const drawn = fixtures.map(([name, diagram]) => {
			const scene = sceneOf(diagram);
			const tags = scene.edges.flatMap((edge) => edge.roles.map((role) => ({ edge, ...role })));
			return { name, scene, tags };
		});
		const named = (name: string, { edge, role, end }: (typeof drawn)[number]["tags"][number]) =>
			`${name}: ${edge.id}, ${role} at ${end}`;

		test("there are tags to check, on Diagrams laid out both ways", () => {
			const tagged = drawn.filter(({ tags }) => tags.length > 0);
			expect(tagged.map(({ name }) => name)).toEqual(
				expect.arrayContaining([
					"context-map.ts: contextMap, drawn right",
					"context-map.ts: contextMap, drawn down",
				]),
			);
			expect(tagged.flatMap(({ tags }) => tags).length).toBeGreaterThanOrEqual(18);
		});

		test("sits on its own Edge's line, which runs through it, nearer the end that carries it than the other", () => {
			for (const { name, tags } of drawn) {
				for (const tag of tags) {
					expect(runsThrough(tag.edge.route, tag.tag), named(name, tag)).toBe(true);
					const center = { x: tag.tag.x + tag.tag.width / 2, y: tag.tag.y + tag.tag.height / 2 };
					const share = shareAlong(tag.edge.route, center);
					expect(tag.end === "from" ? share : 1 - share, named(name, tag)).toBeLessThan(0.5);
				}
			}
		});

		test("comes after its end's other tags along the route, in the model's order", () => {
			for (const { name, scene } of drawn) {
				for (const edge of scene.edges) {
					const shares = edge.roles.map(({ tag }) =>
						shareAlong(edge.route, { x: tag.x + tag.width / 2, y: tag.y + tag.height / 2 }),
					);
					expect(shares, `${name}: ${edge.id}`).toEqual([...shares].sort((a, b) => a - b));
					expect(new Set(shares).size, `${name}: ${edge.id}`).toBe(shares.length);
				}
			}
		});

		test("is clear of every Node, callout, Group label and Edge label, and of every other tag", () => {
			for (const { name, scene, tags } of drawn) {
				const solid = [
					...scene.nodes.flatMap(({ id, box, callout }) => [
						{ what: `Node ${id}`, box },
						...(callout === undefined ? [] : [{ what: `the callout of ${id}`, box: callout.tag }]),
					]),
					...scene.groups.map(({ id, label }) => ({
						what: `the label of Group ${id}`,
						box: label,
					})),
					...scene.edges.flatMap(({ id, label }) =>
						label === undefined ? [] : [{ what: `the label of ${id}`, box: label.box }],
					),
				];
				for (const tag of tags) {
					const others = tags
						.filter((other) => other !== tag)
						.map((other) => ({ what: named(name, other), box: other.tag }));
					const touched = [...solid, ...others].filter(({ box }) => overlap(tag.tag, box));
					expect(
						touched.map(({ what }) => what),
						named(name, tag),
					).toEqual([]);
				}
			}
		});
	});

	describe.each(["right", "down"] as const)("on a context map laid out %s", (direction) => {
		const { scene, diagnostics } = render(contextMap(direction));
		const edges = scene?.edges ?? [];
		const tags = edges.flatMap((edge) => edge.roles.map((role) => ({ edge, ...role })));
		const named = ({ edge, role, end }: (typeof tags)[number]) => `${edge.id}, ${role} at ${end}`;

		test("is one of the roles that its Edge's end carries in the model, in the model's order", () => {
			expect(diagnostics).toEqual([]);
			expect(
				edges.map((edge) => [edge.id, edge.roles.map(({ end, role }) => `${end} ${role}`)]),
			).toEqual([
				["catalog->ordering", ["from OHS", "from PL", "to CF"]],
				["identity->ordering", ["from OHS", "to ACL"]],
				["ordering->billing", []],
				["ordering->shipping", ["from PL"]],
				["card-payments->billing", ["from OHS", "from PL", "to ACL"]],
				["billing->shipping", []],
				["ordering->support", []],
			]);
		});

		test("keeps to the same side of its line as its end's other tags on that line", () => {
			/** How far a tag's middle lies to one side of the run of its Edge's route that passes through it. */
			const aside = ({ edge, tag }: (typeof tags)[number]) => {
				const center = { x: tag.x + tag.width / 2, y: tag.y + tag.height / 2 };
				for (const [index, to] of edge.route.slice(1).entries()) {
					const from = edge.route[index] ?? to;
					if (runsThrough([from, to], tag)) {
						return from.y === to.y
							? { line: `y ${from.y}`, by: center.y - from.y }
							: { line: `x ${from.x}`, by: center.x - from.x };
					}
				}
				return { line: "none", by: 0 };
			};
			for (const edge of edges) {
				for (const end of ["from", "to"] as const) {
					const sides = new Map<string, Set<number>>();
					for (const tag of tags.filter((tag) => tag.edge === edge && tag.end === end)) {
						const { line, by } = aside(tag);
						sides.set(line, (sides.get(line) ?? new Set()).add(Math.sign(by)));
					}
					for (const [line, signs] of sides) {
						expect([...signs], `${edge.id}, ${end}, on ${line}`).toHaveLength(1);
					}
				}
			}
		});

		test("covers no other Edge's line, where two Edges run side by side into one context", () => {
			const beside = edges.filter((edge) => edge.to === "ordering" || edge.to === "billing");
			expect(beside.map(({ id }) => id)).toEqual([
				"catalog->ordering",
				"identity->ordering",
				"ordering->billing",
				"card-payments->billing",
			]);
			for (const tag of tags) {
				const covered = edges.filter(
					(other) => other !== tag.edge && runsThrough(other.route, tag.tag),
				);
				expect(
					covered.map(({ id }) => id),
					named(tag),
				).toEqual([]);
			}
		});
	});
});
