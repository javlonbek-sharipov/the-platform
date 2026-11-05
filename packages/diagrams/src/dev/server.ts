/** Node's built-in HTTP server, with unbundled, type-stripped browser modules. */
import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import { join, relative } from "node:path";
import { setImmediate } from "node:timers/promises";
import { svgOnDisk } from "../atlas/atlas.ts";
import { configFile, moduleSuffix } from "../atlas/discover.ts";
import { indexAtlas, lintAtlas, openAtlas } from "../atlas/index.ts";
import type { CliContext } from "../cli/cli.ts";
import { diagramUrl, page } from "./pages.ts";
import type { PreviewUpdate } from "./protocol.ts";
import { Dependencies } from "./watch.ts";

export async function serveDev({
	root,
	port,
	diagram,
	context,
}: {
	root: string;
	port: number;
	diagram?: string;
	context: CliContext;
}): Promise<number> {
	if (context.signal?.aborted) return 0;
	let revision = 0;
	let stopped = false;
	let running: Promise<void> | undefined;
	let scheduled: ReturnType<typeof setTimeout> | undefined;
	let update: PreviewUpdate = { revision, diagrams: [], messages: [] };
	const drawings = new Map<string, string>();
	const streams = new Set<ServerResponse>();
	const pending = new Map<ServerResponse, PreviewUpdate>();
	const send = (response: ServerResponse, snapshot = update) => {
		if (response.writableNeedDrain) {
			pending.set(response, snapshot);
			return;
		}
		response.write(
			`event: update\nid: ${snapshot.revision}\ndata: ${JSON.stringify(snapshot)}\n\n`,
		);
	};
	const dependencies = new Dependencies(root, () => {
		revision++;
		clearTimeout(scheduled);
		scheduled = setTimeout(() => {
			void build();
		}, 60);
	});
	dependencies.add(join(root, configFile));
	const build = async (): Promise<void> => {
		if (stopped || running !== undefined) return;
		const version = revision;
		running = (async () => {
			const atlas = await openAtlas(root, undefined, {
				signal: context.signal,
				onDependency: (file) => dependencies.add(file),
			});
			for (const file of atlas.dependencies) dependencies.add(file);
			await setImmediate();
			dependencies.check();
			if (stopped || version !== revision) return;
			const invalidConfig = atlas.messages.some(({ severity }) => severity === "error");
			for (const drawing of atlas.diagrams) {
				if (
					!invalidConfig &&
					drawing.svg !== undefined &&
					svgOnDisk(drawing.svgFile, drawing.svg) !== "current"
				) {
					writeFileSync(drawing.svgFile, drawing.svg);
				}
			}
			const { messages } = await lintAtlas(atlas);
			const { index } = await indexAtlas(atlas);
			if (stopped || version !== revision) return;
			update = {
				revision: version,
				messages,
				index: index ?? update.index,
				diagrams: atlas.diagrams.map((drawing) => {
					const id = relative(root, drawing.module)
						.replaceAll("\\", "/")
						.slice(0, -moduleSuffix.length);
					const svg = invalidConfig ? undefined : drawing.svg;
					if (svg !== undefined) drawings.set(id, svg);
					return { id, title: drawing.model?.title ?? id, svg, messages: drawing.messages };
				}),
			};
			for (const stream of streams) send(stream);
		})()
			.catch((error: unknown) => {
				if (context.signal?.aborted || stopped || version !== revision) return;
				const message = error instanceof Error ? error.message : String(error);
				update = {
					...update,
					revision: version,
					messages: [{ file: root, severity: "error", rule: "preview-build", message }],
				};
				for (const stream of streams) send(stream);
			})
			.finally(() => {
				running = undefined;
				if (!stopped && version !== revision) void build();
			});
		await running;
	};
	await build();
	// Startup can itself be superseded by an edit. Serve a completed snapshot,
	// rather than the empty state while the replacement build is loading.
	while (running !== undefined) await running;
	if (context.signal?.aborted) {
		dependencies.close();
		return 0;
	}
	const server = createServer((request, response) => {
		void (async () => {
			const url = new URL(request.url ?? "/", "http://localhost");
			response.setHeader("Cache-Control", "no-store");
			if (url.pathname === "/events") {
				response.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8" });
				streams.add(response);
				response.on("drain", () => {
					const latest = pending.get(response);
					pending.delete(response);
					if (latest !== undefined) send(response, latest);
				});
				response.on("close", () => {
					streams.delete(response);
					pending.delete(response);
				});
				send(response);
				return;
			}
			if (url.pathname.startsWith("/@diagrams/")) {
				const path = url.pathname.slice("/@diagrams/".length);
				if (
					!/^(?:web-component|authoring|core|notations|atlas\/terms|dev\/client)(?:\/[\w/-]+)?\.ts$/.test(
						path,
					)
				) {
					response.writeHead(404).end();
					return;
				}
				const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
				response.setHeader("Content-Type", "text/javascript; charset=utf-8");
				response.end(stripTypeScriptTypes(source));
				return;
			}
			const html =
				url.pathname === "/"
					? page(update, drawings)
					: url.pathname === "/diagram"
						? page(update, drawings, url.searchParams.get("id") ?? "")
						: undefined;
			response.writeHead(html === undefined ? 404 : 200, {
				"Content-Type": "text/html; charset=utf-8",
			});
			response.end(html ?? "No such Diagram.");
		})().catch((error: unknown) => {
			response.writeHead(500).end(error instanceof Error ? error.message : String(error));
		});
	});
	try {
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(port, "127.0.0.1", resolve);
		});
		const address = server.address();
		if (address === null || typeof address === "string")
			throw new Error("The preview has no port.");
		const selected =
			diagram === undefined
				? undefined
				: relative(root, diagram).replaceAll("\\", "/").slice(0, -moduleSuffix.length);
		context.stdout.write(
			`Live preview: http://localhost:${address.port}${selected === undefined ? "/" : diagramUrl(selected)}\n`,
		);
		const heartbeat = setInterval(() => {
			for (const stream of streams) if (!stream.writableNeedDrain) stream.write(": heartbeat\n\n");
		}, 15000);
		await new Promise<void>((resolve) => {
			const stop = () => {
				stopped = true;
				clearInterval(heartbeat);
				clearTimeout(scheduled);
				dependencies.close();
				context.signal?.removeEventListener("abort", stop);
				process.off("SIGINT", stop);
				process.off("SIGTERM", stop);
				for (const stream of streams) stream.end();
				server.close(() => resolve());
			};
			context.signal?.addEventListener("abort", stop, { once: true });
			if (context.signal === undefined) {
				process.once("SIGINT", stop);
				process.once("SIGTERM", stop);
			}
			if (context.signal?.aborted) stop();
		});
	} finally {
		stopped = true;
		dependencies.close();
		clearTimeout(scheduled);
		await running;
	}
	return 0;
}
