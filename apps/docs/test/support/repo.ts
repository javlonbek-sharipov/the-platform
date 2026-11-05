/**
 * A sample repo for the docs site to show: a small shop, laid out as
 * the-platform is, with a glossary map, a context's glossary, ADRs, a spec
 * and a doc that embeds a Diagram.
 */

import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { architecture, render } from "@the-platform/diagrams";

/**
 * Writes files into a fresh temporary folder, each under its path from the
 * folder, and gives back the folder with a function that removes it.
 */
export async function sampleRepo(
	files: Record<string, string>,
): Promise<{ root: string; remove(): Promise<void> }> {
	const root = await realpath(await mkdtemp(join(tmpdir(), "docs-repo-")));
	for (const [path, content] of Object.entries(files)) {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(join(root, path), content);
	}
	return { root, remove: () => rm(root, { recursive: true, force: true }) };
}

/** The SVG of a small Diagram, as the engine writes it: a web app that calls the Checkout API. */
export function checkoutSvg(): string {
	const diagram = architecture({ title: "Checkout" }, (d) => {
		const web = d.node({ id: "shop-web", kind: "client", title: "Shop web app" });
		const api = d.node({
			id: "checkout-api",
			kind: "service",
			title: "Checkout API",
			rows: [{ name: "replicas", value: "3" }],
		});
		d.edge(web, api, { kind: "call", label: "Places orders" });
	});
	const { svg } = render(diagram);
	if (svg === undefined) {
		throw new Error("the sample Diagram has errors");
	}
	return svg;
}
