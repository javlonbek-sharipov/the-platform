/**
 * The `diagrams` CLI, as a function of its arguments, working directory and
 * output streams. The binary only calls it, so tests can run it in-process.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { cacheFolder, lintAtlas, renderDiagrams } from "../atlas/atlas.ts";
import { AtlasError, discover, findRoot } from "../atlas/discover.ts";
import { type AtlasMessage, placeText } from "../atlas/messages.ts";
import type { Diagram } from "../authoring/model.ts";
import { drawPng, type Theme, themes } from "./png.ts";

export interface Output {
	write(text: string): unknown;
}

export interface CliContext {
	cwd: string;
	stdout: Output;
	stderr: Output;
}

const usage = `Usage: diagrams <command>

Commands:
  render [paths...]  Write each Diagram's SVG next to its source
  lint [--json]      Check the whole Atlas: every Diagram, Link and SVG
`;

/** Runs one command, and returns its exit code. */
export async function cli(args: string[], context: CliContext): Promise<number> {
	try {
		return await run(args, context);
	} catch (error) {
		if (error instanceof AtlasError) {
			context.stderr.write(`${error.message}\n`);
			return 2;
		}
		throw error;
	}
}

async function run(args: string[], context: CliContext): Promise<number> {
	const [command, ...rest] = args;
	switch (command) {
		case "render":
			return renderCommand(rest, context);
		case "lint":
			return lintCommand(rest, context);
		case "export":
			return exportCommand(rest, context);
		case undefined:
		case "help":
		case "--help":
			context.stdout.write(usage);
			return 0;
		default:
			context.stderr.write(`Unknown command \`${command}\`.\n\n${usage}`);
			return 2;
	}
}

async function renderCommand(paths: string[], context: CliContext): Promise<number> {
	const root = findRoot(context.cwd);
	const atlas = (await discover(root)).modules;
	const modules =
		paths.length === 0
			? atlas
			: paths.flatMap((path) => {
					const target = resolve(context.cwd, path);
					return existsSync(target) && statSync(target).isDirectory()
						? atlas.filter((module) => module.startsWith(`${target}${sep}`))
						: [target];
				});
	let failed = false;
	for (const diagram of await renderDiagrams(root, modules)) {
		print(diagram.messages, context);
		if (diagram.svg === undefined) {
			failed = true;
			continue;
		}
		if (!existsSync(diagram.svgFile) || readFileSync(diagram.svgFile, "utf8") !== diagram.svg) {
			writeFileSync(diagram.svgFile, diagram.svg);
			context.stdout.write(`Wrote ${shown(diagram.svgFile, context)}\n`);
		}
	}
	return failed ? 1 : 0;
}

async function lintCommand(options: string[], context: CliContext): Promise<number> {
	const unknown = options.find((option) => option !== "--json");
	if (unknown !== undefined) {
		context.stderr.write(`Unknown option \`${unknown}\`.\n\n${usage}`);
		return 2;
	}
	const { diagrams, messages } = await lintAtlas(findRoot(context.cwd));
	const errors = messages.filter((message) => message.severity === "error").length;
	const warnings = messages.length - errors;
	if (options.includes("--json")) {
		const json = messages.map(({ file, line, column, severity, rule, message, pointer }) => ({
			file: shown(file, context),
			line,
			column,
			severity,
			rule,
			message,
			pointer,
		}));
		context.stdout.write(
			`${JSON.stringify({ diagrams, errors, warnings, messages: json }, null, 2)}\n`,
		);
	} else {
		print(messages, context);
		const counts = [
			errors === 0 ? "no errors" : plural(errors, "error"),
			...(warnings === 0 ? [] : [plural(warnings, "warning")]),
		];
		context.stdout.write(`Checked ${plural(diagrams, "Diagram")}: ${counts.join(", ")}.\n`);
	}
	return errors === 0 ? 0 : 1;
}

const formats = ["png", "json"] as const;
type Format = (typeof formats)[number];

async function exportCommand(args: string[], context: CliContext): Promise<number> {
	const parsed = parseOptions(args, ["--format", "--theme", "--scale"]);
	if ("error" in parsed) {
		context.stderr.write(`${parsed.error}\n\n${usage}`);
		return 2;
	}
	const [diagram] = parsed.positionals;
	if (diagram === undefined) {
		context.stderr.write(`Name the Diagram to export.\n\n${usage}`);
		return 2;
	}
	const format = parsed.values.get("--format") as Format;
	if (!formats.includes(format)) {
		context.stderr.write(`Choose \`--format png\` or \`--format json\`.\n\n${usage}`);
		return 2;
	}
	const theme = parsed.values.get("--theme") ?? "light";
	if (!themes.includes(theme as Theme)) {
		context.stderr.write(`Choose \`--theme light\` or \`--theme dark\`.\n\n${usage}`);
		return 2;
	}
	const scale = Number(parsed.values.get("--scale") ?? "1");
	const root = findRoot(context.cwd);
	const [rendered] = await renderDiagrams(root, [resolve(context.cwd, diagram)]);
	const { svg, model } = rendered ?? {};
	if (svg === undefined || model?.id === undefined) {
		return 1;
	}
	const name =
		format === "json"
			? `${model.id}.json`
			: `${model.id}.${theme}${scale === 1 ? "" : `@${scale}x`}.png`;
	const file = join(root, cacheFolder, "export", name);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(
		file,
		format === "json" ? modelJson(model) : drawPng(svg, { theme: theme as Theme, scale }),
	);
	context.stdout.write(`${file}\n`);
	return 0;
}

/**
 * The model as JSON, indented by two spaces. The id that the Atlas gave it
 * goes where a builder writes one, after the notation.
 */
function modelJson(model: Diagram): string {
	const { version, notation, id, ...rest } = model;
	return `${JSON.stringify({ version, notation, id, ...rest }, null, 2)}\n`;
}

/**
 * Splits arguments into positional ones and the values of options, each
 * written `--name value` or `--name=value`. Every option takes a value.
 */
function parseOptions(
	args: string[],
	names: readonly string[],
): { positionals: string[]; values: Map<string, string> } | { error: string } {
	const positionals: string[] = [];
	const values = new Map<string, string>();
	for (let index = 0; index < args.length; index++) {
		const arg = args[index] ?? "";
		if (!arg.startsWith("-")) {
			positionals.push(arg);
			continue;
		}
		const equals = arg.indexOf("=");
		const name = equals < 0 ? arg : arg.slice(0, equals);
		if (!names.includes(name)) {
			return { error: `Unknown option \`${name}\`.` };
		}
		const value = equals < 0 ? args[++index] : arg.slice(equals + 1);
		if (value === undefined) {
			return { error: `The option \`${name}\` needs a value.` };
		}
		values.set(name, value);
	}
	return { positionals, values };
}

/**
 * One line per message: `file:line:column: severity: message (rule)`. A
 * message about a whole file, such as an SVG, has no line or column.
 */
function print(messages: AtlasMessage[], context: CliContext): void {
	for (const { file, line, column, severity, message, rule } of messages) {
		const where = placeText({ file: shown(file, context), line, column });
		context.stdout.write(`${where}: ${severity}: ${message} (${rule})\n`);
	}
}

/** A path as the user sees it: relative to the working directory, with `/`. */
function shown(file: string, context: CliContext): string {
	return relative(context.cwd, file).split(sep).join("/");
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
