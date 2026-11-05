/** Reads the repo's bold-term / definition / _Avoid_ glossary format. */
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { AtlasConfig, AtlasContext } from "../authoring/atlas.ts";
import type { Declarations } from "../authoring/declarations.ts";
import { pointerSegment } from "../core/diagnostics.ts";
import { formats } from "../core/validate.ts";
import { isExcluded } from "./excluded.ts";
import { anchorOf, headingAnchors } from "./markdown.ts";
import { type AtlasMessage, located } from "./messages.ts";
import type { GlossaryTerm } from "./types.ts";

export function readGlossaries(
	root: string,
	module: string,
	input: unknown,
	declarations: Declarations,
	excluded: readonly string[] = [],
): { config: AtlasConfig; terms: GlossaryTerm[]; files: string[]; messages: AtlasMessage[] } {
	const contexts: Record<string, AtlasContext> = Object.create(null);
	const config: AtlasConfig = { contexts };
	const terms: GlossaryTerm[] = [];
	const files: string[] = [];
	const messages: AtlasMessage[] = [];
	const report = (pointer: string, message: string, rule = "config-shape") => {
		messages.push(located(module, declarations, { severity: "error", rule, message, pointer }));
	};
	const given = (input as { contexts?: unknown }).contexts;
	if (given === undefined) return { config, terms, files, messages };
	if (!isObject(given)) {
		report(
			"/contexts",
			'`contexts` must be an object keyed by context id, such as `{ billing: { glossary: "billing/GLOSSARY.md" } }`.',
		);
		return { config, terms, files, messages };
	}
	for (const [context, entry] of Object.entries(given).sort(([a], [b]) =>
		a < b ? -1 : a > b ? 1 : 0,
	)) {
		const at = `/contexts/${pointerSegment(context)}`;
		if (!new RegExp(formats.slug).test(context)) {
			report(
				at,
				`Context id \`${context}\` must be one lowercase kebab-case name, such as \`billing\`.`,
				"config-context-id",
			);
			continue;
		}
		if (!isObject(entry)) {
			report(at, `Context \`${context}\` must be an object with a \`glossary\` path.`);
			continue;
		}
		for (const key of Object.keys(entry)) {
			if (key !== "glossary")
				report(
					`${at}/${pointerSegment(key)}`,
					`Context \`${context}\` has no setting \`${key}\`. Its only setting is \`glossary\`.`,
				);
		}
		const glossary = entry.glossary;
		if (typeof glossary !== "string" || glossary.trim() === "") {
			report(
				`${at}/glossary`,
				`Context \`${context}\` needs a nonempty \`glossary\` path from the Atlas root.`,
			);
			continue;
		}
		const file = resolve(root, glossary);
		files.push(file);
		if (isAbsolute(glossary) || !inside(root, file)) {
			report(
				`${at}/glossary`,
				`Context \`${context}\`'s glossary \`${glossary}\` must be a relative path inside the Atlas.`,
				"glossary-path",
			);
			continue;
		}
		contexts[context] = { glossary: relative(root, file).split(sep).join("/") };
		if (isExcluded(file, excluded)) {
			report(
				`${at}/glossary`,
				`Context \`${context}\`'s glossary \`${glossary}\` is excluded by this Atlas host.`,
				"glossary-path",
			);
			continue;
		}
		try {
			const real = realpathSync(file);
			if (!statSync(file).isFile() || !inside(realpathSync(root), real)) {
				throw new Error("It must name a file inside the Atlas.");
			}
			// Keep the authored path for diagnostics and link changes, and the
			// resolved target for native events reported at its real location.
			files.push(real);
			const path = contexts[context]?.glossary ?? glossary;
			terms.push(
				...parseGlossary(readFileSync(file, "utf8"), context, path, (line, message) =>
					report(`${at}/glossary`, `${path}:${line}:1: ${message}`, "glossary-entry"),
				),
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			report(
				`${at}/glossary`,
				`Cannot read context \`${context}\`'s glossary \`${glossary}\`: ${reason}`,
				"glossary-load",
			);
		}
	}
	return { config, terms, files, messages };
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inside(root: string, file: string): boolean {
	const path = relative(root, file);
	return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function parseGlossary(
	markdown: string,
	context: string,
	glossary: string,
	report: (line: number, message: string) => void,
): GlossaryTerm[] {
	const terms: GlossaryTerm[] = [];
	const anchors = new Set<string>();
	const occupied = headingAnchors(markdown);
	let current: GlossaryTerm | undefined;
	let definition: string[] = [];
	let hasAvoid = false;
	let fence: { marker: string; length: number } | undefined;
	const finish = () => {
		if (current !== undefined) {
			current.definition = definition.join("\n").trim();
			if (current.definition === "")
				report(current.line, `Term \`${current.term}\` needs a definition below it.`);
			terms.push(current);
		}
		current = undefined;
		definition = [];
		hasAvoid = false;
	};
	for (const [index, line] of markdown.split(/\r?\n/).entries()) {
		const fenced = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		const wasFenced = fence !== undefined;
		if (fenced !== null) {
			const marker = fenced[1] ?? "";
			if (fence === undefined) {
				fence = { marker: marker[0] ?? "", length: marker.length };
			} else if (
				marker[0] === fence.marker &&
				marker.length >= fence.length &&
				(fenced[2] ?? "").trim() === ""
			) {
				fence = undefined;
			}
		}
		if (wasFenced || fenced !== null) {
			if (current !== undefined) definition.push(line);
			continue;
		}
		const term = /^\*\*([^*]+)\*\*:[ \t]*$/.exec(line)?.[1]?.trim();
		if (term !== undefined) {
			finish();
			current = {
				context,
				term,
				definition: "",
				avoid: [],
				anchor: anchorOf(term),
				glossary,
				line: index + 1,
			};
			if (current.anchor === "")
				report(index + 1, `Term \`${term}\` needs a name that makes a nonempty anchor.`);
			else if (anchors.has(current.anchor))
				report(
					index + 1,
					`Term \`${term}\` has an anchor already used by another term. Give each entry a distinct name.`,
				);
			anchors.add(current.anchor);
			const base = current.anchor;
			for (let suffix = 1; occupied.has(current.anchor); suffix++)
				current.anchor = `${base}-${suffix}`;
			occupied.add(current.anchor);
		} else if (/^\*\*.*\*\*:/.test(line)) {
			finish();
			report(
				index + 1,
				"Write a nonempty bold term and its colon on a line of its own: `**Invoice**:`.",
			);
		} else if (/^ {0,3}#{1,6}(?:\s|$)/.test(line)) {
			finish();
		} else {
			const avoid = /^_Avoid_:[ \t]*(.*)$/.exec(line);
			if (avoid !== null) {
				if (current === undefined)
					report(index + 1, "An `_Avoid_:` line must follow a glossary term and its definition.");
				else if (hasAvoid)
					report(
						index + 1,
						`Term \`${current.term}\` already has an \`_Avoid_:\` line. List its words together.`,
					);
				else {
					current.avoid = (avoid[1] ?? "").split(",").map((word) => word.trim());
					if (current.avoid.some((word) => word === ""))
						report(
							index + 1,
							"An `_Avoid_:` list has an empty word. Separate nonempty words or phrases with commas.",
						);
					hasAvoid = true;
				}
			} else if (current !== undefined) definition.push(line);
		}
	}
	finish();
	return terms;
}
