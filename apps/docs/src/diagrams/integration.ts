/**
 * The site's Diagrams, as an Astro integration: every page loads the script
 * that defines the web component.
 */

import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";

const client = fileURLToPath(new URL("./client.ts", import.meta.url));

export function diagrams(): AstroIntegration {
	return {
		name: "diagrams",
		hooks: {
			"astro:config:setup": ({ injectScript }) => {
				// A page script is bundled, with the component's modules in it, and runs on every page.
				injectScript("page", `import ${JSON.stringify(client)};`);
			},
		},
	};
}
