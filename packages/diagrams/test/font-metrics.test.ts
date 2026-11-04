import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, onTestFinished, test } from "vitest";

const run = promisify(execFile);
const script = fileURLToPath(new URL("../scripts/generate-font-metrics.ts", import.meta.url));
const committed = fileURLToPath(new URL("../src/core/font-metrics.ts", import.meta.url));

test("the metrics script generates the committed metrics from the bundled font, the same each run", async () => {
	const folder = await mkdtemp(join(tmpdir(), "diagrams-font-metrics-"));
	onTestFinished(() => rm(folder, { recursive: true, force: true }));
	const first = join(folder, "first.ts");
	const second = join(folder, "second.ts");

	await run(process.execPath, [script, first]);
	await run(process.execPath, [script, second]);

	const generated = await readFile(first, "utf8");
	expect(generated).toBe(await readFile(committed, "utf8"));
	expect(await readFile(second, "utf8")).toBe(generated);
});
