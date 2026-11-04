/**
 * The `diagrams` CLI, as a function of its arguments, working directory and
 * output streams. The binary only calls it, so tests can run it in-process.
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { lintAtlas, renderDiagrams } from "../atlas/atlas.ts";
import { AtlasError, discover, findRoot } from "../atlas/discover.ts";
import { type AtlasMessage, placeText } from "../atlas/messages.ts";

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
