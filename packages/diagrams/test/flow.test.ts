import { describe, expect, test } from "vitest";
import { architecture, architectureNotation, builderOf, domain, render } from "../src/index.ts";
import { plumbingNotation } from "./support/plumbing.ts";
import { descendants, parseSvg } from "./support/svg.ts";

function flowIds(svg = ""): string[] {
	return descendants(parseSvg(svg)).flatMap((element) => {
		const id = element.attributes.get("data-flow");
		return id === undefined ? [] : [id];
	});
}

const calls = architecture({ title: "Calls" }, (d) => {
	const api = d.node({ id: "api", kind: "service", title: "API" });
	const db = d.node({ id: "db", kind: "database", title: "DB" });
	d.edge(api, db, { kind: "call", id: "query" });
	d.edge(db, api, { kind: "message", id: "changes" });
});

function atRate(rate?: string) {
	return architecture({ title: "Load" }, (d) => {
		const a = d.node({ id: "a", kind: "service", title: "A" });
		const b = d.node({ id: "b", kind: "worker", title: "B" });
		d.edge(a, b, { kind: "call", rate });
	});
}

describe("flow animation", () => {
	test("follows the Notation's capability, including one defined only by a caller", () => {
		expect(flowIds(render(calls).svg)).toEqual(["query", "changes"]);
		expect(
			flowIds(render(calls, { notations: [{ ...architectureNotation, flow: false }] }).svg),
		).toEqual([]);

		const definition = { ...plumbingNotation, flow: true };
		const house = builderOf(definition)({ title: "House" }, (d) => {
			const a = d.node({ id: "a", kind: "tank", title: "A" });
			const b = d.node({ id: "b", kind: "tank", title: "B" });
			d.edge(a, b, { kind: "drain", id: "water" });
			d.edge(a, b, { kind: "coupling", id: "joined" });
		});
		expect(flowIds(render(house, { notations: [definition] }).svg)).toEqual(["water"]);

		const contexts = domain({ title: "Contexts" }, (d) => {
			const a = d.node({ id: "a", kind: "context", title: "A" });
			const b = d.node({ id: "b", kind: "context", title: "B" });
			d.edge(a, b, { kind: "upstream-downstream" });
		});
		const { svg } = render(contexts);
		expect(flowIds(svg)).toEqual([]);
		expect(svg).not.toContain("@keyframes");
	});

	test("gets faster and denser with the logarithm of load, with a slow default and a cap", () => {
		// log2(1 + events/second), capped at 16: 16 + 4*level px/s,
		// 96 - 4*level px between marks. These rates give exact integer levels.
		const cases = [
			[undefined, 16, 96],
			["0/s", 16, 96],
			["1/s", 20, 92],
			["3/s", 24, 88],
			["15/s", 32, 80],
			["255/s", 48, 64],
			["65535/s", 80, 32],
			["100M/s", 80, 32],
			[`${"9".repeat(310)}/s`, 80, 32],
		] as const;
		for (const [rate, speed, spacing] of cases) {
			const { scene, svg } = render(atRate(rate));
			expect(scene?.edges[0]?.flow, rate).toEqual({ speed, spacing });
			expect(svg).not.toMatch(/NaN|Infinity/);
		}
		const { scene } = render(atRate("30/s"));
		expect(scene?.edges[0]?.flow?.speed).toBeCloseTo(35.8168, 3);
		expect(scene?.edges[0]?.flow?.spacing).toBeCloseTo(76.1832, 3);
	});

	test("normalizes rate units before computing speed and spacing", () => {
		const rates = ["2k/s", "120k/min", "7.2M/h", "2000/s"];
		const flows = rates.map((rate) => render(atRate(rate)).scene?.edges[0]?.flow);
		expect(flows[0]).toBeDefined();
		expect(flows.slice(1)).toEqual([flows[0], flows[0], flows[0]]);
		expect(render(atRate("0.5/s")).scene?.edges[0]?.flow?.speed).toBeCloseTo(18.33985, 3);
	});

	test("writes deterministic, scoped CSS keyframes and a flow path that preserves the routed stroke", () => {
		const model = atRate("30/s");
		const { svg, scene } = render(model);
		expect(svg).toBe(render(model).svg);
		// JSON tools may build each object's keys in another order.
		const reordered = JSON.parse(
			JSON.stringify(model, (_, value: unknown) =>
				typeof value === "object" && value !== null && !Array.isArray(value)
					? Object.fromEntries(Object.entries(value).reverse())
					: value,
			),
		);
		expect(render(reordered).svg).toBe(svg);
		const root = parseSvg(svg ?? "");
		const scope = root.attributes.get("class");
		const [flow] = descendants(root).filter((element) => element.attributes.has("data-flow"));
		expect(flow?.name).toBe("path");
		const paths = flow?.parent?.children.filter((element) => element.name === "path") ?? [];
		expect(paths.length).toBeGreaterThan(2);
		expect(flow?.attributes.get("d")).toBe(paths[0]?.attributes.get("d"));
		expect(flow?.attributes.get("stroke-dasharray")).toBe("6 70.18");
		expect(flow?.attributes.get("style")).toContain("animation-duration: 2.13s");
		expect(svg).toContain(`@keyframes ${scope}-flow`);
		expect(svg).toContain(`.${scope} [data-flow]`);
		expect(scene?.edges[0]?.flow?.speed).toBeGreaterThan(16);
		const other = parseSvg(render(atRate("1/s")).svg ?? "").attributes.get("class");
		expect(other).not.toBe(scope);
	});
});
