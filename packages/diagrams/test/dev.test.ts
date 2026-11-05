import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { expect, onTestFinished, test } from "vitest";
import { cli } from "../src/cli/cli.ts";
import { runCli, sampleAtlas, shopModule } from "./support/atlas.ts";

/** Start through the same CLI seam as the binary, using an OS-assigned port. */
async function preview(root: string, diagram?: string) {
	const stop = new AbortController();
	let output = "";
	let errors = "";
	let started!: (url: string) => void;
	let failed!: (reason: Error) => void;
	const ready = new Promise<string>((resolve, reject) => {
		started = resolve;
		failed = reject;
	});
	const done = cli(["dev", ...(diagram ? [diagram] : []), "--port", "0"], {
		cwd: root,
		signal: stop.signal,
		stdout: {
			write(text) {
				output += text;
				const url = /http:\/\/localhost:\d+\/\S*/.exec(output)?.[0];
				if (url) started(url);
			},
		},
		stderr: {
			write: (text) => {
				errors += text;
			},
		},
	});
	void done.then((code) => failed(new Error(`dev stopped (${code}): ${errors}`)), failed);
	onTestFinished(async () => {
		stop.abort();
		await done;
	});
	return { url: await ready, stop: () => stop.abort(), done };
}

test("dev lists the Atlas, serves a Diagram and stripped component modules, and stops cleanly", async () => {
	const root = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });
	const server = await preview(root, "docs/shop.diagram.ts");
	const page = await fetch(server.url);
	expect(page.status).toBe(200);
	const html = await page.text();
	expect(html).toContain("<platform-diagram");
	expect(html).toContain("Shop API");
	const listing = await (await fetch(new URL("/", server.url))).text();
	expect(listing).toContain("Shop");
	expect(listing).toContain("docs/shop");
	const component = await fetch(
		new URL("/@diagrams/web-component/platform-diagram.ts", server.url),
	);
	expect(component.headers.get("content-type")).toContain("javascript");
	expect(await component.text()).not.toContain("#svg: SVGSVGElement");
	server.stop();
	expect(await server.done).toBe(0);
	await expect(fetch(server.url)).rejects.toThrow();
});

interface Update {
	revision: number;
	diagrams: {
		id: string;
		svg?: string;
		messages: { file: string; line?: number; message: string; severity: string }[];
	}[];
	messages: { file: string; line?: number; message: string; severity: string }[];
}

/** Read the public SSE protocol, keeping every published result for newest-build checks. */
async function subscribe(url: string) {
	const response = await fetch(new URL("/events", url));
	expect(response.headers.get("content-type")).toContain("text/event-stream");
	const updates: Update[] = [];
	if (response.body === null) throw new Error("The event stream has no body.");
	const reader = response.body.getReader();
	const reading = (async () => {
		const decoder = new TextDecoder();
		let buffered = "";
		for (;;) {
			const { value, done } = await reader.read();
			if (done) return;
			buffered += decoder.decode(value, { stream: true });
			for (;;) {
				const end = buffered.indexOf("\n\n");
				if (end < 0) break;
				const event = buffered.slice(0, end);
				buffered = buffered.slice(end + 2);
				const data = event
					.split("\n")
					.filter((line) => line.startsWith("data: "))
					.map((line) => line.slice(6))
					.join("\n");
				if (data) updates.push(JSON.parse(data));
			}
		}
	})();
	onTestFinished(async () => {
		await reader.cancel();
		await reading;
	});
	const next = async (after = 0) => {
		await expect.poll(() => updates.length, { timeout: 4000 }).toBeGreaterThan(after);
		const update = updates[after];
		if (update === undefined) throw new Error("No preview update arrived.");
		return update;
	};
	return { updates, next, reading };
}

function drawingSvg(update: Update): string {
	const svg = update.diagrams.find(({ id }) => id === "docs/shop")?.svg;
	if (svg === undefined) throw new Error("The preview has no SVG for docs/shop.");
	return svg;
}

async function matchesRender(root: string, svg: string) {
	const file = join(root, "docs/shop.diagram.svg");
	expect(await readFile(file, "utf8")).toBe(svg);
	expect((await runCli(["render", "docs/shop.diagram.ts"], root)).code).toBe(0);
	expect(await readFile(file, "utf8")).toBe(svg);
}

test("edits rebuild the Diagram over SSE and write exactly what a fresh render writes", async () => {
	const root = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });
	const server = await preview(root);
	const events = await subscribe(server.url);
	const initial = await events.next();
	await matchesRender(root, drawingSvg(initial));
	await writeFile(join(root, "docs/shop.diagram.ts"), shopModule("Changed"));
	const update = await events.next(1);
	expect(update.diagrams[0]?.svg).toContain("Changed API");
	await matchesRender(root, drawingSvg(update));
	server.stop();
	expect(await server.done).toBe(0);
	await events.reading;
});

test("edits to transitive imports rebuild every drawing that imports the shared module", async () => {
	const module = `import { title } from "./shared.ts";\n${shopModule().replace('"Shop API"', "title")}`;
	const root = await sampleAtlas({
		"docs/shop.diagram.ts": module,
		"docs/other.diagram.ts": module,
		"docs/shared.ts": 'export { title } from "./titles.ts";\n',
		"docs/titles.ts": 'export const title = "Original";\n',
	});
	const server = await preview(root);
	const events = await subscribe(server.url);
	await events.next();
	await writeFile(join(root, "docs/titles.ts"), 'export const title = "Imported edit";\n');
	const update = await events.next(1);
	expect(update.diagrams.map(({ svg }) => svg?.includes("Imported edit"))).toEqual([true, true]);
	await matchesRender(root, drawingSvg(update));
});

test("module errors name the source line, retain the last good drawing, and recover after an atomic save", async () => {
	const source = shopModule();
	const root = await sampleAtlas({ "docs/shop.diagram.ts": source });
	const server = await preview(root, "docs/shop.diagram.ts");
	const events = await subscribe(server.url);
	const good = drawingSvg(await events.next());
	await writeFile(
		join(root, "docs/shop.diagram.ts"),
		`${source}\nthrow new Error("Edit failure");\n`,
	);
	const failed = await events.next(1);
	expect(failed.diagrams[0]?.svg).toBeUndefined();
	expect(failed.messages).toContainEqual(
		expect.objectContaining({
			file: expect.stringMatching(/docs\/shop\.diagram\.ts$/),
			line: source.split("\n").length + 1,
			severity: "error",
			message: expect.stringContaining("Edit failure"),
		}),
	);
	expect(await readFile(join(root, "docs/shop.diagram.svg"), "utf8")).toBe(good);
	expect(await (await fetch(server.url)).text()).toContain("Shop API");
	await writeFile(join(root, "docs/shop.diagram.ts.tmp"), shopModule("Recovered"));
	await rename(join(root, "docs/shop.diagram.ts.tmp"), join(root, "docs/shop.diagram.ts"));
	const recovered = await events.next(2);
	expect(recovered.messages.filter(({ severity }) => severity === "error")).toEqual([]);
	await matchesRender(root, drawingSvg(recovered));
});

test("config and glossary edits refresh diagnostics and the Atlas index", async () => {
	const root = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });
	const server = await preview(root);
	const events = await subscribe(server.url);
	await events.next();
	await mkdir(join(root, "language"));
	await writeFile(join(root, "language/GLOSSARY.md"), "# Shop\n\n**Order**:\nA request.\n");
	await writeFile(
		join(root, "diagrams.config.ts"),
		'export default { contexts: { shop: { glossary: "language/GLOSSARY.md" } } };\n',
	);
	await events.next(1);
	await writeFile(
		join(root, "language/GLOSSARY.md"),
		"# Shop\n\n**Order**:\nAn edited definition.\n",
	);
	const update = await events.next(2);
	expect(JSON.stringify(update)).toContain("An edited definition.");
	await matchesRender(root, drawingSvg(update));
});

test("changes during a slow rebuild publish only the newest result", async () => {
	const root = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });
	const server = await preview(root);
	const events = await subscribe(server.url);
	await events.next();
	await writeFile(
		join(root, "docs/shop.diagram.ts"),
		`await new Promise((resolve) => setTimeout(resolve, 700));\n${shopModule("Obsolete")}`,
	);
	// Give the real worker time to enter the delayed module, then save again.
	await new Promise((resolve) => setTimeout(resolve, 250));
	await writeFile(join(root, "docs/shop.diagram.ts"), shopModule("Newest"));
	const update = await events.next(1);
	expect(update.diagrams[0]?.svg).toContain("Newest API");
	expect(
		events.updates.some(({ diagrams }) => diagrams.some(({ svg }) => svg?.includes("Obsolete"))),
	).toBe(false);
	await matchesRender(root, drawingSvg(update));
});

test("the browser redraws on saves and shows file-and-line errors over the last good drawing", async () => {
	const source = shopModule();
	const root = await sampleAtlas({ "docs/shop.diagram.ts": source });
	const server = await preview(root, "docs/shop.diagram.ts");
	const browser = await chromium.launch();
	onTestFinished(() => browser.close());
	const page = await browser.newPage();
	await page.goto(server.url);
	await page.locator("platform-diagram").getByText("Shop API", { exact: true }).waitFor();
	await writeFile(join(root, "docs/shop.diagram.ts"), shopModule("Browser edit"));
	await page.locator("platform-diagram").getByText("Browser edit API", { exact: true }).waitFor();
	await writeFile(
		join(root, "docs/shop.diagram.ts"),
		`${source}\nthrow new Error("Browser failure");\n`,
	);
	await page
		.getByRole("alert")
		.getByText(/Browser failure/)
		.waitFor();
	expect(await page.getByRole("alert").textContent()).toContain(
		`docs/shop.diagram.ts:${source.split("\n").length + 1}`,
	);
	await page.locator("platform-diagram").getByText("Browser edit API", { exact: true }).waitFor();
	await writeFile(join(root, "docs/shop.diagram.ts"), source);
	await page.getByRole("alert").waitFor({ state: "hidden" });
	await page.locator("platform-diagram").getByText("Shop API", { exact: true }).waitFor();
}, 15000);

test("stopping dev terminates an in-flight module load and closes its event streams", async () => {
	const root = await sampleAtlas({ "docs/shop.diagram.ts": shopModule() });
	const server = await preview(root);
	const events = await subscribe(server.url);
	await events.next();
	await writeFile(
		join(root, "docs/shop.diagram.ts"),
		`await new Promise((resolve) => setTimeout(resolve, 1200));\n${shopModule("Slow")}`,
	);
	await new Promise((resolve) => setTimeout(resolve, 250));
	const before = performance.now();
	server.stop();
	expect(await server.done).toBe(0);
	expect(performance.now() - before).toBeLessThan(500);
	await events.reading;
});

test("creating a missing imported module recovers without restarting dev", async () => {
	const source = `import { title } from "./later/title.ts";\n${shopModule().replace('"Shop API"', "title")}`;
	const root = await sampleAtlas({ "docs/shop.diagram.ts": source });
	const server = await preview(root);
	const events = await subscribe(server.url);
	expect((await events.next()).diagrams[0]?.svg).toBeUndefined();
	await mkdir(join(root, "docs/later"));
	await writeFile(join(root, "docs/later/title.ts"), 'export const title = "Created import";\n');
	const update = await events.next(1);
	expect(drawingSvg(update)).toContain("Created import");
	await matchesRender(root, drawingSvg(update));
});
