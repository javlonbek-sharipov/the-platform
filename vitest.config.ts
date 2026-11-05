import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/** The web component's tests, which run in a real browser (spec: Seam 3). */
const browserTests = "packages/*/test/browser/**/*.test.ts";

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: "node",
					include: ["packages/*/test/**/*.test.ts"],
					exclude: [browserTests],
					typecheck: {
						enabled: true,
						include: ["packages/*/test/**/*.test-d.ts"],
					},
				},
			},
			{
				test: {
					name: "browser",
					include: [browserTests],
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: "chromium" }],
						// Without a window, so that a test run never opens one on the desk.
						headless: true,
						viewport: { width: 1280, height: 720 },
					},
				},
			},
		],
	},
});
