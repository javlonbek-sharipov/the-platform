import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { runCli, sampleAtlas, shopModule } from "./support/atlas.ts";

test("every command opens the config and reports its load failure before writing output", async () => {
	const root = await sampleAtlas({
		"diagrams.config.ts": 'throw new Error("No config today.");\n',
		"docs/shop.diagram.ts": shopModule(),
	});
	for (const args of [
		["render"],
		["export", "docs/shop.diagram.ts", "--format", "json"],
		["export", "docs/shop.diagram.ts", "--format", "png"],
		["export", "--index"],
	]) {
		const result = await runCli(args, root);
		expect(result.code, args.join(" ")).toBe(1);
		expect(result.stdout + result.stderr).toContain(
			"diagrams.config.ts:1:7: error: The module failed to load: No config today. (module-load)",
		);
	}
	const lint = await runCli(["lint", "--json"], root);
	expect(lint.code).toBe(1);
	expect(JSON.parse(lint.stdout).messages).toContainEqual({
		file: "diagrams.config.ts",
		line: 1,
		column: 7,
		severity: "error",
		rule: "module-load",
		message: "The module failed to load: No config today.",
	});
	expect(existsSync(join(root, "docs/shop.diagram.svg"))).toBe(false);
	expect(existsSync(join(root, ".diagrams-cache"))).toBe(false);
});
