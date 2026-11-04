/**
 * The `diagrams` CLI, as a function of its arguments, working directory and
 * output streams. The binary only calls it, so tests can run it in-process.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { cacheFolderOf, lintAtlas, renderDiagrams } from "../atlas/atlas.ts";
import { AtlasError, discover, findRoot, moduleSuffix } from "../atlas/discover.ts";
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
  export <diagram> --format png|json [--theme light|dark] [--scale n] [--out path]
                     Write a Diagram, named by its module's path, as a PNG or
                     as its JSON model, and print the file's path
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

/** How far `--scale` goes, either way. */
const scales = { least: 0.25, most: 8 };

/** What `diagrams export` was asked for. */
interface ExportRequest {
	/** The path of the Diagram's module, as given. */
	diagram: string;
	format: Format;
	theme: Theme;
	scale: number;
	/** The path of the file to write, as given. Without it, the file goes into the cache folder. */
	out?: string;
}

async function exportCommand(args: string[], context: CliContext): Promise<number> {
	const request = exportRequest(args);
	if ("error" in request) {
		context.stderr.write(`${request.error}\n\n${usage}`);
		return 2;
	}
	const root = findRoot(context.cwd);
	const module = resolve(context.cwd, request.diagram);
	if (!module.endsWith(moduleSuffix) || !existsSync(module) || !statSync(module).isFile()) {
		context.stderr.write(
			`There's no Diagram at \`${shown(module, context)}\`. Name one by its module's path, which ends in \`${moduleSuffix}\`.\n`,
		);
		return 2;
	}
	const [rendered] = await renderDiagrams(root, [module]);
	const { svg, model, messages = [] } = rendered ?? {};
	// The path alone goes to stdout, so that a script can read it.
	print(messages, context, context.stderr);
	if (svg === undefined || model?.id === undefined) {
		return 1;
	}
	const file =
		request.out === undefined
			? join(cacheFolderOf(root), "export", exportName(model.id, request))
			: resolve(context.cwd, request.out);
	const contents = request.format === "json" ? modelJson(model) : drawPng(svg, request);
	try {
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, contents);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		context.stderr.write(`Couldn't write \`${shown(file, context)}\`: ${reason}\n`);
		return 2;
	}
	context.stdout.write(`${file}\n`);
	return 0;
}

/** Reads the export's arguments, or says what's wrong with them. */
function exportRequest(args: string[]): ExportRequest | { error: string } {
	const parsed = parseOptions(args, ["--format", "--theme", "--scale", "--out"]);
	if ("error" in parsed) {
		return parsed;
	}
	const { positionals, values } = parsed;
	const [diagram, ...others] = positionals;
	if (diagram === undefined) {
		return {
			error: "Name the Diagram to export by its module's path, such as `docs/shop.diagram.ts`.",
		};
	}
	if (others.length > 0) {
		return { error: "Export one Diagram at a time." };
	}
	const format = formats.find((name) => name === values.get("--format"));
	if (format === undefined) {
		return { error: "Choose a format: `--format png` or `--format json`." };
	}
	const theme = themes.find((name) => name === (values.get("--theme") ?? "light"));
	if (theme === undefined) {
		return { error: "Choose a theme: `--theme light` or `--theme dark`." };
	}
	const scaleText = values.get("--scale") ?? "1";
	const scale = Number(scaleText);
	if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(scaleText) || scale < scales.least || scale > scales.most) {
		return {
			error: `\`--scale\` takes a number from ${scales.least} to ${scales.most}, such as \`2\`.`,
		};
	}
	return { diagram, format, theme, scale, out: values.get("--out") };
}

/**
 * A file's name in the cache folder: the Diagram's id, and for a PNG, its
 * theme and any scale but 1, as in `docs/shop.dark@2x.png`.
 */
function exportName(id: string, { format, theme, scale }: ExportRequest): string {
	return format === "json" ? `${id}.json` : `${id}.${theme}${scale === 1 ? "" : `@${scale}x`}.png`;
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
function print(messages: AtlasMessage[], context: CliContext, output = context.stdout): void {
	for (const { file, line, column, severity, message, rule } of messages) {
		const where = placeText({ file: shown(file, context), line, column });
		output.write(`${where}: ${severity}: ${message} (${rule})\n`);
	}
}

/** A path as the user sees it: relative to the working directory, with `/`. */
function shown(file: string, context: CliContext): string {
	return relative(context.cwd, file).split(sep).join("/");
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
