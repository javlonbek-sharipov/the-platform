import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { SimpleIcon } from "simple-icons";
import * as simpleIcons from "simple-icons";
import { describe, expect, onTestFinished, test } from "vitest";
import { technologies } from "../src/index.ts";

const run = promisify(execFile);
const script = fileURLToPath(new URL("../scripts/generate-technologies.ts", import.meta.url));
const committed = fileURLToPath(new URL("../src/notations/technologies.ts", import.meta.url));

describe("the logo table", () => {
	test("is what the technologies script generates from Simple Icons, the same each run", async () => {
		const folder = await mkdtemp(join(tmpdir(), "diagrams-technologies-"));
		onTestFinished(() => rm(folder, { recursive: true, force: true }));
		const first = join(folder, "first.ts");
		const second = join(folder, "second.ts");

		await run(process.execPath, [script, first]);
		await run(process.execPath, [script, second]);

		const generated = await readFile(first, "utf8");
		expect(generated).toBe(await readFile(committed, "utf8"));
		expect(await readFile(second, "utf8")).toBe(generated);
	});

	test("holds each Technology's display name and logo as Simple Icons has them, from icons under CC0 only", () => {
		const icons = Object.values(simpleIcons).filter((icon): icon is SimpleIcon => "slug" in icon);
		const entries = Object.entries(technologies);
		expect(entries.length).toBeGreaterThan(0);
		for (const [slug, { name, path }] of entries) {
			// A slug the model accepts: lowercase words joined by hyphens.
			expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			const icon = icons.find((candidate) => candidate.path === path);
			expect(icon?.title, slug).toBe(name);
			expect(icon?.svg, slug).toContain('viewBox="0 0 24 24"');
			// Some icons carry a license of their own, which may not be CC0.
			expect(icon?.license?.type ?? "CC0-1.0", slug).toBe("CC0-1.0");
		}
	});

	test("starts with common databases, message brokers, languages, runtimes and clouds", () => {
		const starting = {
			databases: ["postgres", "mysql", "mongodb", "redis", "sqlite", "elasticsearch"],
			"message brokers": ["rabbitmq", "nats", "google-pubsub"],
			languages: ["go", "python", "typescript", "kotlin", "swift", "elixir"],
			runtimes: ["nodejs", "bun", "dotnet", "docker", "kubernetes"],
			clouds: ["google-cloud", "cloudflare", "digitalocean", "vercel", "hetzner"],
		};
		for (const [category, slugs] of Object.entries(starting)) {
			for (const slug of slugs) {
				expect(Object.hasOwn(technologies, slug), `${category}: ${slug}`).toBe(true);
			}
		}
		// Names come from Simple Icons, as each brand writes its own.
		expect(technologies.postgres.name).toBe("PostgreSQL");
		expect(technologies.nodejs.name).toBe("Node.js");
		expect(technologies["google-cloud"].name).toBe("Google Cloud");
	});
});
