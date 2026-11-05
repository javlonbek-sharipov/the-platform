import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "vitest";
import { git, sampleAtlas, shopModule } from "./support/atlas.ts";
import { pngSize } from "./support/png.ts";

const run = promisify(execFile);
const repo = fileURLToPath(new URL("../../../", import.meta.url));

// These tests run the real binary; the others call the CLI function in-process.

test("the diagrams binary renders and lints a sample Atlas, with the right exit codes", async () => {
	const atlas = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });
	const diagrams = join(repo, "node_modules", ".bin", "diagrams");

	expect(await run(diagrams, ["render"], { cwd: atlas })).toEqual({
		stdout: "Wrote docs/shop.diagram.svg\n",
		stderr: "",
	});
	expect(await run(diagrams, ["lint"], { cwd: atlas })).toEqual({
		stdout: "Checked 1 Diagram: no errors.\n",
		stderr: "",
	});

	await rm(join(atlas, "docs/shop.diagram.svg"));
	await expect(run(diagrams, ["lint"], { cwd: atlas })).rejects.toMatchObject({
		code: 1,
		stdout: expect.stringContaining("docs/shop.diagram.svg: error:"),
	});
});

test("the diagrams binary exports a PNG, and prints its path", async () => {
	const atlas = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });
	const diagrams = join(repo, "node_modules", ".bin", "diagrams");

	const png = join(atlas, ".diagrams-cache/export/docs/shop.dark@2x.png");
	const args = ["export", "docs/shop.diagram.ts", "--format", "png", "--theme", "dark"];
	expect(await run(diagrams, [...args, "--scale", "2"], { cwd: atlas })).toEqual({
		stdout: `${png}\n`,
		stderr: "",
	});
	expect(pngSize(await readFile(png)).width).toBeGreaterThan(0);
});

test("as a git pre-commit hook, `diagrams lint --staged` judges each commit by what it would hold", async () => {
	const atlas = await sampleAtlas({ "docs/shop.diagram.ts": shopModule("Shop") });
	const diagrams = join(repo, "node_modules", ".bin", "diagrams");
	git(atlas, "init", "-q");
	const hook = `#!/bin/sh\nexec "${diagrams}" lint --staged\n`;
	await writeFile(join(atlas, ".git/hooks/pre-commit"), hook, { mode: 0o755 });
	const env = { ...process.env };
	for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) {
		delete env[name];
	}
	const commit = (...args: string[]) =>
		run(
			"git",
			[
				"-c",
				"user.name=Test",
				"-c",
				"user.email=test@example.com",
				"-c",
				"commit.gpgsign=false",
			].concat(["commit", "-q", "-m", "Draw the shop", ...args]),
			{ cwd: atlas, env },
		);
	const commits = () => git(atlas, "rev-list", "--count", "HEAD").trim();

	await run(diagrams, ["render"], { cwd: atlas });
	git(atlas, "add", "-A");
	await commit();
	expect(commits()).toBe("1");

	// Render an edit, then commit the module alone: git gives the hook an
	// index that holds the new module beside the old SVG.
	await writeFile(join(atlas, "docs/shop.diagram.ts"), shopModule("Store"));
	await run(diagrams, ["render"], { cwd: atlas });
	// Git sends what a hook prints to stderr.
	await expect(commit("--", "docs/shop.diagram.ts")).rejects.toMatchObject({
		stderr: expect.stringContaining(
			"docs/shop.diagram.svg: error: The staged SVG doesn't match its staged source.",
		),
	});
	expect(commits()).toBe("1");

	// `git commit -a` takes the SVG too.
	await commit("-a");
	expect(commits()).toBe("2");
});
