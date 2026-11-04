import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { SimpleIcon } from "simple-icons";
import * as simpleIcons from "simple-icons";
import { describe, expect, onTestFinished, test } from "vitest";
import {
	architecture,
	architectureNodeKinds,
	type Box,
	render,
	type SceneText,
	technologies,
} from "../src/index.ts";
import { draw, groupOf, nodeOf, paintsWithin, shapesOf } from "./support/drawn.ts";
import { computedStyle, descendants, type Point, paintedBounds, runsOf } from "./support/svg.ts";

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

/** Whether `inner` lies inside `outer`, borders included. */
function within(inner: Box, outer: Box): boolean {
	return (
		inner.x >= outer.x &&
		inner.y >= outer.y &&
		inner.x + inner.width <= outer.x + outer.width &&
		inner.y + inner.height <= outer.y + outer.height
	);
}

/**
 * Where a text's ink lies: as wide as it's measured, from the top of its
 * capitals, which are centered on its point, to the bottom of its descenders.
 * Inter's capitals are 0.73 of its size tall, and its descenders 0.24.
 */
function inkBox({ point, width, size }: SceneText): Box {
	const top = point.y - (0.73 * size) / 2;
	return { x: point.x - width / 2, y: top, width, height: (0.73 + 0.24) * size };
}

/** Whether any segment of a run, painted `half` wide on each side, crosses a box. */
function crosses(run: Point[], box: Box, half: number): boolean {
	const left = box.x - half;
	const top = box.y - half;
	const right = box.x + box.width + half;
	const bottom = box.y + box.height + half;
	return run.slice(1).some((b, index) => {
		const a = run[index] ?? b;
		// Clips the segment to the box, one side at a time.
		let low = 0;
		let high = 1;
		const sides: [number, number][] = [
			[a.x - b.x, a.x - left],
			[b.x - a.x, right - a.x],
			[a.y - b.y, a.y - top],
			[b.y - a.y, bottom - a.y],
		];
		for (const [toward, room] of sides) {
			if (toward === 0) {
				if (room < 0) {
					return false;
				}
			} else if (toward < 0) {
				low = Math.max(low, room / toward);
			} else {
				high = Math.min(high, room / toward);
			}
		}
		return low <= high;
	});
}

/** A text's box: as wide as it's measured, and as tall as its font size, around its point. */
function textBox({
	point,
	width,
	size,
}: {
	point: { x: number; y: number };
	width: number;
	size: number;
}): Box {
	return { x: point.x - width / 2, y: point.y - size / 2, width, height: size };
}

describe("a Node with a Technology", () => {
	const orders = architecture({ title: "Orders" }, (d) => {
		d.node({ id: "orders-db", kind: "database", title: "Orders DB", technology: "postgres" });
	});

	test("shows the Technology's logo at the end of its header, and the Technology's name below its title", () => {
		const drawn = draw(orders);
		const { header, title, technology, logo } = nodeOf(drawn.scene, "orders-db");
		if (technology === undefined || logo === undefined) {
			throw new Error("expected the Node's Technology and its logo");
		}
		expect(logo.technology).toBe("postgres");
		expect(technology.text).toBe("PostgreSQL");
		expect(technology.shortened).toBe(false);

		// The logo is a square, level with the header's middle, after the title.
		expect(logo.box.width).toBe(logo.box.height);
		expect(logo.box.y + logo.box.height / 2).toBe(header.y + header.height / 2);
		expect(logo.box.x).toBeGreaterThan(title.point.x + title.width / 2);
		// The name is smaller, centered below the title, and clear of it.
		expect(technology.size).toBeLessThan(title.size);
		expect(technology.point.x).toBe(title.point.x);
		expect(technology.point.y - technology.size / 2).toBeGreaterThanOrEqual(
			title.point.y + title.size / 2,
		);
		for (const box of [logo.box, textBox(title), textBox(technology)]) {
			expect(within(box, header), JSON.stringify(box)).toBe(true);
		}

		// The SVG draws Simple Icons' own PostgreSQL logo in that box, and the name below the title.
		const group = groupOf(drawn, "orders-db");
		const drawnLogos = descendants(group).filter(
			(element) =>
				element.name === "path" && element.attributes.get("d") === simpleIcons.siPostgresql.path,
		);
		expect(drawnLogos).toHaveLength(1);
		const painted = paintedBounds(drawnLogos[0] ?? group, drawn.rules, "light");
		const rounding = 0.01;
		expect(painted.left).toBeGreaterThanOrEqual(logo.box.x - rounding);
		expect(painted.top).toBeGreaterThanOrEqual(logo.box.y - rounding);
		expect(painted.right).toBeLessThanOrEqual(logo.box.x + logo.box.width + rounding);
		expect(painted.bottom).toBeLessThanOrEqual(logo.box.y + logo.box.height + rounding);
		// A logo fills its square along at least one side.
		expect(Math.max(painted.right - painted.left, painted.bottom - painted.top)).toBeGreaterThan(
			0.9 * logo.box.width,
		);
		const texts = descendants(group).filter((element) => element.name === "text");
		expect(texts.map((text) => text.text)).toEqual(["Orders DB", "PostgreSQL"]);
	});

	test("shows a slug that has no logo as its name, giving the title the logo's room, and isn't an error", () => {
		// `constructor` names no Technology, though every JavaScript object has one.
		for (const slug of ["our-own-bus", "constructor"]) {
			const diagram = architecture({ title: "Orders" }, (d) => {
				d.node({ id: "plain", kind: "service", title: "Orders API" });
				d.node({ id: "own", kind: "service", title: "Orders API", technology: slug });
			});
			const { diagnostics } = render(diagram);
			expect(diagnostics, slug).toEqual([]);

			const drawn = draw(diagram);
			const plain = nodeOf(drawn.scene, "plain");
			const own = nodeOf(drawn.scene, "own");
			expect(own.technology?.text, slug).toBe(slug);
			expect(own.logo, slug).toBeUndefined();
			// The title is centered across the header as a title without a Technology is.
			expect(own.title.point.x - own.box.x).toBe(plain.title.point.x - plain.box.x);
			const group = groupOf(drawn, "own");
			expect(descendants(group).some((element) => element.name === "svg")).toBe(false);
			const texts = descendants(group).filter((element) => element.name === "text");
			expect(texts.map((text) => text.text)).toEqual(["Orders API", slug]);
		}
	});

	test("keeps its title, its Technology's name and the logo clear of its outline, in every Kind", () => {
		const title = "A title as wide as the header";
		const drawn = draw(
			architecture({ title: "Kinds" }, (d) => {
				for (const kind of architectureNodeKinds) {
					d.node({ id: `${kind}-alone`, kind, title, technology: "typescript" });
					d.node({
						id: `${kind}-with-rows`,
						kind,
						title,
						technology: "typescript",
						status: "down",
						rows: [{ name: "replicas", value: "3" }],
					});
				}
			}),
		);
		for (const node of drawn.scene.nodes) {
			const { technology, logo, badge, status } = node;
			if (technology === undefined || logo === undefined) {
				throw new Error(`expected ${node.id}'s Technology and its logo`);
			}
			// The outline is every shape the Node draws but its badge, logo and status mark.
			const marks = [badge, logo.box, ...(status === undefined ? [] : [status.mark])];
			const outline = shapesOf(drawn, node.id).filter(
				(shape) => !marks.some((mark) => paintsWithin(drawn, shape, mark)),
			);
			expect(outline.length, node.id).toBeGreaterThan(0);
			for (const shape of outline) {
				const style = computedStyle(shape, drawn.rules, "light");
				const half = style.get("stroke") === "none" ? 0 : Number(style.get("stroke-width")) / 2;
				const clear: [string, Box][] = [
					["title", inkBox(node.title)],
					["Technology", inkBox(technology)],
					["logo", logo.box],
				];
				for (const [part, box] of clear) {
					expect(
						runsOf(shape).some((run) => crosses(run, box, half)),
						`${node.id}: <${shape.name}> crosses its ${part}`,
					).toBe(false);
				}
			}
		}
	});
});
