/**
 * The licenses of what the repo installs. Every dependency needs a
 * permissive license, so that none narrows the choice of the engine's own
 * (spec: Dependencies, and ADR-0001). The docs site brought most of the
 * packages, so the check lives with it, and covers the whole workspace.
 */

import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * The permissive licenses. The spec names MIT, BSD, ISC and Apache-2.0. The
 * docs site's tools brought three more, which ask for no more than those do:
 * the Blue Oak Model License, and two that give up every right, 0BSD and CC0,
 * which Simple Icons has too.
 */
const permissive = [
	"MIT",
	"ISC",
	"BSD-2-Clause",
	"BSD-3-Clause",
	"Apache-2.0",
	"BlueOak-1.0.0",
	"0BSD",
	"CC0-1.0",
];

/**
 * The packages under MPL-2.0, which the spec allows for a tool that the repo
 * uses unmodified: the CLI's rasterizer, and the CSS tool that Vite runs for
 * the tests and for the site's build. Each also comes as a package for each
 * platform, named after it.
 */
const unmodifiedTools = ["@resvg/resvg-js", "lightningcss"];

/** A package that pnpm installed: its name, its version, and its license as its `package.json` gives it. */
interface Installed {
	name: string;
	version: string;
	license: string;
}

/** Every package in the workspace's store, each version once. */
function installed(): Installed[] {
	const store = join(root, "node_modules/.pnpm");
	const packages = new Map<string, Installed>();
	for (const entry of readdirSync(store)) {
		const modules = join(store, entry, "node_modules");
		if (!existsSync(modules)) {
			continue;
		}
		for (const name of readdirSync(modules)) {
			const folders = name.startsWith("@")
				? readdirSync(join(modules, name)).map((scoped) => join(modules, name, scoped))
				: [join(modules, name)];
			for (const folder of folders) {
				const manifest = join(folder, "package.json");
				// A link is another package's own folder, which is read where it is.
				if (lstatSync(folder).isSymbolicLink() || !existsSync(manifest)) {
					continue;
				}
				const read = JSON.parse(readFileSync(manifest, "utf8")) as Record<string, unknown>;
				const license = typeof read.license === "string" ? read.license : "none";
				packages.set(`${read.name}@${read.version}`, {
					name: String(read.name),
					version: String(read.version),
					license,
				});
			}
		}
	}
	return [...packages.values()];
}

/**
 * Whether a license expression is met by licenses that are allowed: every
 * part of an `AND`, and any part of an `OR`.
 */
function allows(allowed: string[], expression: string): boolean {
	return expression
		.replace(/[()]/g, "")
		.split(" OR ")
		.some((choice) => choice.split(" AND ").every((license) => allowed.includes(license.trim())));
}

test("every package the workspace installs has a permissive license", () => {
	const packages = installed();
	expect(packages.length).toBeGreaterThan(200);

	const others = packages
		.filter(({ name, license }) => {
			const tool = unmodifiedTools.some((tool) => name === tool || name.startsWith(`${tool}-`));
			return !allows(tool ? [...permissive, "MPL-2.0"] : permissive, license);
		})
		.map(({ name, version, license }) => `${name}@${version}: ${license}`)
		.sort();

	expect(others).toEqual([]);
});

test("sharp and its libvips, which is LGPL, stay out of the lockfile", () => {
	const lockfile = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
	const names = [...lockfile.matchAll(/^ {2}'?((?:@[^/@\s]+\/)?[^@\s']+)@/gm)].map(
		([, name = ""]) => name,
	);
	expect(names).toContain("astro");

	expect(names.filter((name) => name === "sharp" || name.startsWith("@img/"))).toEqual([]);
});
