import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect } from "vitest";

const goldenFolder = new URL("../golden/", import.meta.url);

/** Set by `pnpm golden:update`, the only way golden files change. */
const updating = process.env.DIAGRAMS_UPDATE_GOLDEN === "1";

/** Compares an SVG with its golden file, byte for byte. */
export function expectGolden(name: string, svg: string): void {
	const file = new URL(`${name}.svg`, goldenFolder);
	if (updating) {
		mkdirSync(goldenFolder, { recursive: true });
		writeFileSync(file, svg);
		return;
	}
	if (!existsSync(file)) {
		expect.fail(
			`There's no golden file ${name}.svg yet. Run \`pnpm golden:update\`, then review it.`,
		);
	}
	const golden = readFileSync(file);
	if (!Buffer.from(svg, "utf8").equals(golden)) {
		expect(svg, `${name}.svg changed. If that's intended, run \`pnpm golden:update\`.`).toBe(
			golden.toString("utf8"),
		);
		expect.fail(`${name}.svg differs from its golden file byte for byte.`);
	}
}
