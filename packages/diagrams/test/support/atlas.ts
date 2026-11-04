import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { onTestFinished } from "vitest";
import { cli } from "../../src/cli/cli.ts";

const packageFolder = fileURLToPath(new URL("../../", import.meta.url));

/** The config that marks a sample Atlas, unless a test writes its own. */
export const sampleConfig = `import { atlas } from "@the-platform/diagrams";

export default atlas({});
`;

/**
 * Writes a sample Atlas into a fresh temporary folder, laid out like the repo:
 * an ES-module package that depends on @the-platform/diagrams, with a
 * `diagrams.config.ts` at its root. The folder is removed when the test
 * finishes.
 */
export async function sampleAtlas(files: Record<string, string>): Promise<string> {
	const root = await realpath(await mkdtemp(join(tmpdir(), "diagrams-atlas-")));
	onTestFinished(() => rm(root, { recursive: true, force: true }));
	await writeFile(join(root, "package.json"), '{ "private": true, "type": "module" }\n');
	await mkdir(join(root, "node_modules", "@the-platform"), { recursive: true });
	await symlink(packageFolder, join(root, "node_modules", "@the-platform", "diagrams"), "junction");
	for (const [path, content] of Object.entries({ "diagrams.config.ts": sampleConfig, ...files })) {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(join(root, path), content);
	}
	return root;
}

export interface CliRun {
	code: number;
	stdout: string;
	stderr: string;
}

/** Runs the CLI in-process, as the `diagrams` binary would. */
export async function runCli(args: string[], cwd: string): Promise<CliRun> {
	let stdout = "";
	let stderr = "";
	const code = await cli(args, {
		cwd,
		stdout: {
			write: (text) => {
				stdout += text;
			},
		},
		stderr: {
			write: (text) => {
				stderr += text;
			},
		},
	});
	return { code, stdout, stderr };
}

/**
 * A small architecture Diagram module, titled as given: a web app that calls
 * an API named after the title, such as `shop-api`. So two of them in one
 * Atlas share only the web app.
 */
export function shopModule(title = "Shop"): string {
	const api = `${title.toLowerCase().replaceAll(" ", "-")}-api`;
	return `import { architecture } from "@the-platform/diagrams";

export default architecture({ title: ${JSON.stringify(title)} }, (d) => {
	const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
	const api = d.node({ id: ${JSON.stringify(api)}, kind: "service", title: ${JSON.stringify(`${title} API`)} });
	d.edge(web, api, { kind: "call" });
});
`;
}

/** Runs git in a sample Atlas, unaffected by any repo that the environment points at. */
export function git(root: string, ...args: string[]): void {
	const env = { ...process.env };
	for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) {
		delete env[name];
	}
	execFileSync("git", ["-c", "init.defaultBranch=main", ...args], {
		cwd: root,
		env,
		stdio: "ignore",
	});
}
