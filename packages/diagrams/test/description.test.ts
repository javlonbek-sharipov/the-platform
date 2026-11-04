import { describe, expect, test } from "vitest";
import {
	architecture,
	architectureEdgeKinds,
	architectureEdgeLooks,
	render,
} from "../src/index.ts";
import { descendants, parseSvg } from "./support/svg.ts";

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
		for (const kind of architectureEdgeKinds) {
			const { sentence } = architectureEdgeLooks[kind];
			expect(sentence, kind).toContain("{from}");
			expect(sentence, kind).toContain("{to}");
		}
		expect(architectureEdgeLooks.call.sentence).toBe("{from} calls {to}");
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
