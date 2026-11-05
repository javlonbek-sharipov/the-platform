import { describe, expect, test } from "vitest";
import { architecture, architectureNotation, edgeKindsOf, render } from "../src/index.ts";
import orderFlow from "./fixtures/edges.ts";
import { everyFixture } from "./support/fixtures.ts";
import { descendants, parseSvg } from "./support/svg.ts";

const fixtures = await everyFixture();

/**
 * A checkout: an API that calls another, which calls a card network we
 * don't run and announces each payment on a queue. The queue's topic feeds
 * back into the first API.
 */
const checkout = architecture({ title: "Checkout" }, (d) => {
	const api = d.node({ id: "checkout-api", kind: "service", title: "Checkout API" });
	const payments = d.node({
		id: "payments-api",
		kind: "service",
		title: "Payments API",
		status: "degraded",
	});
	const network = d.node({
		id: "card-network",
		kind: "system",
		title: "Card network",
		external: true,
	});
	const events = d.node({
		id: "payment-events",
		kind: "queue",
		title: "Payment events",
		rows: [{ name: "payment-made" }],
	});
	d.edge(api, payments, { kind: "call" });
	d.edge(payments, network, { kind: "call" });
	d.edge(payments, events, { kind: "message" });
	d.edge(events.row("payment-made"), api, { kind: "message" });
});

function rootOf(diagram: unknown) {
	const { svg, diagnostics } = render(diagram);
	expect(diagnostics).toEqual([]);
	return parseSvg(svg ?? "");
}

describe("each Edge Kind of the architecture Notation", () => {
	test("declares a sentence form that names both ends", () => {
		for (const kind of edgeKindsOf(architectureNotation)) {
			const { sentence } = architectureNotation.edgeKinds[kind];
			expect(sentence, kind).toContain("{from}");
			expect(sentence, kind).toContain("{to}");
		}
		expect(architectureNotation.edgeKinds.call.sentence).toBe("{from} calls {to}");
	});
});

describe("an SVG, for screen readers,", () => {
	test("is an image", () => {
		expect(rootOf(checkout).attributes.get("role")).toBe("img");
	});

	test("starts with a title that holds the Diagram's title", () => {
		const [first] = rootOf(checkout).children;
		expect(first?.name).toBe("title");
		expect(first?.text).toBe("Checkout");
	});

	test("has a description that lists its Nodes, and its Edges in their sentence forms", () => {
		const descriptions = rootOf(checkout).children.filter((child) => child.name === "desc");
		expect(descriptions.map((desc) => desc.text)).toEqual([
			"Nodes: Checkout API (service); Payments API (service, degraded); Card network (system, External); Payment events (queue). Edges: Checkout API calls Payments API. Payments API calls Card network. Payments API sends messages to Payment events. Payment events (payment-made) sends messages to Checkout API.",
		]);
	});

	test("describes each Node by its whole title, even where the drawing shortens it", () => {
		const long = architecture({ title: "Long titles" }, (d) => {
			const a = d.node({
				id: "translations",
				kind: "service",
				title: "Internationalization service",
			});
			const b = d.node({ id: "orders-db", kind: "database", title: "Orders database" });
			d.edge(a, b, { kind: "call" });
		});
		const root = parseSvg(render(long).svg ?? "");
		const drawn = descendants(root).filter((element) => element.name === "text");
		expect(drawn.map((text) => text.text)).toContainEqual(expect.stringMatching(/^Internati.*…$/));
		const desc = root.children.find((child) => child.name === "desc");
		expect(desc?.text).toBe(
			"Nodes: Internationalization service (service); Orders database (database). Edges: Internationalization service calls Orders database.",
		);
	});

	test("says which Edges cross between regions or zones, which the drawing shows only in color and a badge", () => {
		const desc = rootOf(orderFlow).children.find((child) => child.name === "desc");
		expect(desc?.text).toBe(
			"Nodes: Web app (client); Orders API (service); Orders database (database); Order events (queue); Stock API (service); Mailer (worker); Analytics (worker). Edges: Web app calls Orders API. Orders API calls Orders database. Orders API sends messages to Order events. Orders API calls Stock API across zones. Order events sends messages to Mailer. Order events sends messages to Analytics across regions.",
		);
	});

	test("says what each Edge carries: its Technology, its rate and its label", () => {
		const carried = architecture({ title: "Carried" }, (d) => {
			const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
			const api = d.node({ id: "checkout-api", kind: "service", title: "Checkout API" });
			const payments = d.node({ id: "payments-api", kind: "service", title: "Payments API" });
			d.edge(web, api, { kind: "call", label: "Places   orders", rate: "30/s" });
			d.edge(api, payments, { kind: "call", label: "authorize", technology: "grpc", rate: "2k/s" });
			d.edge(payments, api, { kind: "message", technology: "kafka" });
		});
		const desc = rootOf(carried).children.find((child) => child.name === "desc");
		expect(desc?.text).toBe(
			"Nodes: Web app (client); Checkout API (service); Payments API (service). Edges: Web app calls Checkout API at 30/s: Places orders. Checkout API calls Payments API over grpc at 2k/s: authorize. Payments API sends messages to Checkout API over kafka.",
		);
	});

	test("escapes what it says", () => {
		const escapes = architecture({ title: 'R&D <"Ops">' }, (d) => {
			d.node({ id: "billing", kind: "system", title: "Billing & <tax>" });
		});
		const root = parseSvg(render(escapes).svg ?? "");
		expect(root.children.find((child) => child.name === "title")?.text).toBe('R&D <"Ops">');
		expect(root.children.find((child) => child.name === "desc")?.text).toBe(
			"Nodes: Billing & <tax> (system). Edges: none.",
		);
	});
});

/** A copy of a JSON value with every object's fields in the reverse order. */
function reversedFields(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(reversedFields);
	}
	if (typeof value === "object" && value !== null) {
		return Object.fromEntries(
			Object.entries(value)
				.reverse()
				.map(([key, field]) => [key, reversedFields(field)]),
		);
	}
	return value;
}

describe("an SVG's metadata", () => {
	test("holds the Diagram's JSON model, which parses back to the model, for every fixture", () => {
		for (const [name, diagram] of fixtures) {
			const metadata = parseSvg(render(diagram).svg ?? "").children.filter(
				(child) => child.name === "metadata",
			);
			expect(metadata, name).toHaveLength(1);
			expect(JSON.parse(metadata[0]?.text ?? ""), name).toEqual(diagram);
		}
	});

	test("holds text that would break the markup, escaped, and gives it back as it was", () => {
		const escapes = architecture({ id: "escapes", title: 'R&D <"Ops"> ]]>' }, (d) => {
			d.node({ id: "billing", kind: "system", title: "Billing & <tax> --" });
		});
		const { svg } = render(escapes);
		const metadata = parseSvg(svg ?? "").children.find((child) => child.name === "metadata");
		expect(JSON.parse(metadata?.text ?? "")).toEqual(escapes);
		expect(svg).not.toContain("<tax>");
	});

	test("carries a Diagram's description and its Nodes', which nothing else in the SVG draws", () => {
		const described = {
			...checkout,
			description: "How a payment goes through.",
			nodes: checkout.nodes.map((node) => ({ ...node, description: `What ${node.title} does.` })),
		};
		const plain = (render(checkout).svg ?? "").split("\n");
		const lines = (render(described).svg ?? "").split("\n");

		expect(lines.length).toBe(plain.length);
		const changed = lines.filter((line, index) => line !== plain[index]);
		expect(changed).toHaveLength(1);
		const metadata = parseSvg(lines.join("\n")).children.find((child) => child.name === "metadata");
		expect(changed[0]?.trim().startsWith("<metadata>")).toBe(true);
		expect(JSON.parse(metadata?.text ?? "")).toEqual(described);
	});

	test("is the same, byte for byte, whatever order the model's fields are written in", () => {
		const reordered = reversedFields(JSON.parse(JSON.stringify(checkout)));
		expect(Object.keys(reordered as object)[0]).toBe("walkthroughs");
		expect(render(reordered).svg).toBe(render(checkout).svg);
	});
});
