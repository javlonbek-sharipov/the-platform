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

/**
 * The SVG of a small Diagram, as the engine writes it: a shop's checkout. It
 * draws in every color of the theme: each family of Kinds, each status, a
 * callout, a Group, labels, and an Edge that crosses between regions.
 */
export function checkoutSvg(): string {
	const diagram = architecture({ title: "Checkout" }, (d) => {
		const shopper = d.node({ id: "shopper", kind: "person", title: "Shopper" });
		const web = d.node({ id: "shop-web", kind: "client", title: "Shop web app" });
		d.edge(shopper, web, { kind: "call" });
		d.group({ id: "eu-west", kind: "region", title: "EU West" }, (region) => {
			const api = region.node({
				id: "checkout-api",
				kind: "service",
				title: "Checkout API",
				status: "degraded",
				callout: "SPOF",
				rows: [{ name: "replicas", value: "3" }],
			});
			const orders = region.node({
				id: "orders-db",
				kind: "database",
				title: "Orders database",
				status: "ok",
			});
			const events = region.node({
				id: "order-events",
				kind: "queue",
				title: "Order events",
				status: "unknown",
			});
			d.edge(web, api, { kind: "call", label: "Places orders", technology: "graphql" });
			d.edge(api, orders, { kind: "call" });
			d.edge(api, events, { kind: "message" });
		});
		d.group({ id: "us-east", kind: "region", title: "US East" }, (region) => {
			const provider = region.node({
				id: "payment-provider",
				kind: "system",
				title: "Payment provider",
				external: true,
				status: "down",
			});
			d.edge("checkout-api", provider, { kind: "call" });
		});
	});
	const { svg } = render(diagram);
	if (svg === undefined) {
		throw new Error("the sample Diagram has errors");
	}
	return svg;
}
