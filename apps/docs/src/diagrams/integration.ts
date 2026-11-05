/**
 * The site's Diagrams, as an Astro integration: every page loads the script
 * that defines the web component.
 */

import { fileURLToPath } from "node:url";
import type { AtlasIndex } from "@the-platform/diagrams";
import type { AstroIntegration } from "astro";
import type { SitePage } from "./pages.ts";

const client = fileURLToPath(new URL("./client.ts", import.meta.url));

export function diagrams(index: AtlasIndex, pages: Record<string, SitePage>): AstroIntegration {
	return {
		name: "diagrams",
		hooks: {
			"astro:config:setup": ({ injectScript, updateConfig }) => {
				const virtual = "virtual:diagram-atlas";
				updateConfig({
					vite: {
						plugins: [
							{
								name: "diagram-atlas",
								resolveId: (id) => (id === virtual ? `\0${virtual}` : undefined),
								load: (id) =>
									id === `\0${virtual}`
										? `export default ${JSON.stringify({ index, pages })};`
										: undefined,
							},
						],
					},
				});
				// A page script is bundled, with the component's modules in it, and runs on every page.
				injectScript("page", `import ${JSON.stringify(client)};`);
			},
		},
	};
}
