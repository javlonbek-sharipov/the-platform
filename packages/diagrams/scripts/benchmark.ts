/**
 * The benchmark (spec: Seam 1, Speed): how long the crowded fixture takes to
 * lay out, route and draw its SVG, in each direction, in plain Node, as the
 * CLI runs the core. `pnpm bench` runs it. The test suite checks only a
 * generous limit.
 *
 * It times the fixture with every Edge labeled too. Labeled Edges that trunks
 * would crowd out keep lanes of their own, so layout and routing run again.
 */

import { type Diagram, type Direction, render } from "../src/index.ts";
import { crowded } from "../test/fixtures/crowded.ts";
import { labeled } from "../test/support/labeled.ts";

/** Runs to warm the engine up before timing, and runs to time. */
const warmups = 5;
const runs = 30;

const fixtures: [string, (direction: Direction) => Diagram][] = [
	["The crowded fixture", crowded],
	["The crowded fixture, with every Edge labeled", (direction) => labeled(crowded(direction))],
];

for (const [name, fixture] of fixtures) {
	for (const direction of ["right", "down"] as const) {
		const diagram = fixture(direction);
		for (let run = 0; run < warmups; run += 1) {
			render(diagram);
		}
		const times: number[] = [];
		for (let run = 0; run < runs; run += 1) {
			const started = performance.now();
			render(diagram);
			times.push(performance.now() - started);
		}
		times.sort((a, b) => a - b);
		const median = times[Math.floor(times.length / 2)] ?? 0;
		console.log(
			`${name}, drawn ${direction}: ${median.toFixed(1)} ms median, ` +
				`${(times[0] ?? 0).toFixed(1)} to ${(times.at(-1) ?? 0).toFixed(1)} ms over ${runs} runs.`,
		);
	}
}
