import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
	type EdgeKindDefinition,
	edgeKindsOf,
	groupKindsOf,
	type NodeKindDefinition,
	nodeKindsOf,
	notations,
	rolesOf,
	statusesOf,
} from "../src/index.ts";

/**
 * Each of the engine's Notations is one definition, the module
 * `src/notations/<name>.ts`, which the rest of the engine reads. So another
 * Notation is added by writing its definition, without touching the core.
 * These tests read the engine's sources to hold it to that.
 */
const sources = fileURLToPath(new URL("../src/", import.meta.url));

/** Every module of the engine, by its path from `src/`, in path order. */
function modules(folder = sources): string[] {
	return readdirSync(folder, { withFileTypes: true })
		.flatMap((entry) => {
			const path = join(folder, entry.name);
			if (entry.isDirectory()) {
				return modules(path);
			}
			return entry.name.endsWith(".ts") ? [relative(sources, path).split(sep).join("/")] : [];
		})
		.sort();
}

/** A module's code: its text, without the lines that are comments. */
function codeOf(module: string): string {
	return readFileSync(join(sources, module), "utf8")
		.split("\n")
		.filter((line) => !/^\s*(?:\/\/|\/\*|\*)/.test(line))
		.join("\n");
}

/** The modules that a module imports from, or exports from, by their paths from `src/`. */
function importsOf(module: string): string[] {
	const folder = dirname(join(sources, module));
	return [...codeOf(module).matchAll(/from "(\.[^"]+)"/g)].map(([, specifier = ""]) =>
		relative(sources, resolve(folder, specifier)).split(sep).join("/"),
	);
}

/**
 * Strings that only look like a Kind's name, by module: a worker thread posts
 * its results in a `message` event; playback has an ARIA `region`. `typeof x === "function"` is excused
 * everywhere, since it names JavaScript's own type.
 */
const otherMeanings: Record<string, string[]> = {
	"atlas/load.ts": ["message"],
	"web-component/walkthroughs.ts": ["region"],
};
const typeofFunction = /typeof [^;\n]*?[!=]==? "function"/g;

describe.each(notations.map((notation) => [notation.name, notation] as const))(
	"the %s Notation",
	(name, notation) => {
		const definition = `notations/${name}.ts`;

		test("is defined in one module, which nothing but its builder, the list of Notations and the package's index reads", () => {
			expect(modules()).toContain(definition);
			const readers = modules().filter((module) => importsOf(module).includes(definition));

			expect(readers).toEqual([`authoring/${name}.ts`, "index.ts", "notations/notations.ts"]);
		});

		test("refers only to what it defines: each Kind's hue, and the Node Kinds each Edge Kind may join", () => {
			const hues = Object.keys(notation.hues);
			const nodeKinds: string[] = nodeKindsOf(notation);
			const looks = Object.values<NodeKindDefinition>(notation.nodeKinds);
			const joined = Object.values<EdgeKindDefinition>(notation.edgeKinds).flatMap(
				({ from = [], to = [] }) => [...from, ...to],
			);

			expect(looks.map(({ hue }) => hue).filter((hue) => !hues.includes(hue))).toEqual([]);
			expect(hues.filter((hue) => !looks.some((look) => look.hue === hue))).toEqual([]);
			expect(joined.filter((kind) => !nodeKinds.includes(kind))).toEqual([]);
			// Its Nodes may have a status exactly when it has statuses for them.
			const nodeFields: readonly string[] = notation.fields.node;
			expect(nodeFields.includes("status")).toBe(statusesOf(notation).length > 0);
		});

		test("lets its Edges' ends carry only roles that it defines, each of which some end may carry, and none on a symmetric Kind", () => {
			const roles: string[] = rolesOf(notation);
			const edgeKinds = Object.entries<EdgeKindDefinition>(notation.edgeKinds);
			const carried = edgeKinds.flatMap(([, kind]) =>
				[kind.roles?.from, kind.roles?.to].flatMap((end) =>
					end === undefined ? [] : "oneOf" in end ? end.oneOf : end.anyOf,
				),
			);

			expect(carried.filter((role) => !roles.includes(role))).toEqual([]);
			expect(roles.filter((role) => !carried.includes(role))).toEqual([]);
			expect(
				edgeKinds.filter(([, kind]) => kind.symmetric === true && kind.roles !== undefined),
			).toEqual([]);
			// Its Edges may have roles exactly when it has roles for them.
			const edgeFields: readonly string[] = notation.fields.edge;
			expect(edgeFields.includes("roles")).toBe(roles.length > 0);
		});

		test("sizes each Node Kind in whole steps of 16 px, twice the grid, so that its corners land on the grid", () => {
			for (const [kind, { width, height }] of Object.entries<NodeKindDefinition>(
				notation.nodeKinds,
			)) {
				expect([width % 16, height % 16], kind).toEqual([0, 0]);
			}
		});

		test("has Kinds and roles that nothing outside its definition names", () => {
			const kinds = [
				...nodeKindsOf(notation),
				...groupKindsOf(notation),
				...edgeKindsOf(notation),
				...rolesOf(notation),
			];
			expect(kinds.length).toBeGreaterThan(0);
			const named = modules()
				.filter((module) => module !== definition)
				.flatMap((module) => {
					const code = codeOf(module).replace(typeofFunction, "");
					return kinds
						.filter((kind) => !otherMeanings[module]?.includes(kind))
						.filter((kind) =>
							[`"${kind}"`, `'${kind}'`, `\`${kind}\``].some((s) => code.includes(s)),
						)
						.map((kind) => `src/${module} names \`${kind}\``);
				});

			expect(
				named,
				"Read the Kind's or the role's rule from the Notation's definition instead. A string that only looks like the name of one goes in `otherMeanings`.",
			).toEqual([]);
		});
	},
);
