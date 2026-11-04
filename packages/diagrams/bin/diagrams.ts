#!/usr/bin/env node
import { cli } from "../src/cli/cli.ts";

process.exitCode = await cli(process.argv.slice(2), {
	cwd: process.cwd(),
	stdout: process.stdout,
	stderr: process.stderr,
});
