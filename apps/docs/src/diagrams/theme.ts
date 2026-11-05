/**
 * The site's theme for Diagrams. A Diagram's SVG follows the reader's system
 * wherever the page leaves a `--diagram-` property unset. The site has a
 * theme switch of its own, which may differ from the system's setting, so it
 * sets every property, for each of its two themes.
 *
 * The colors are the engine's own for a light and for a dark page, so a
 * Diagram looks on the site as it does on GitHub in the same theme.
 */

import { notations, themeColors } from "@the-platform/diagrams";

/** The style sheet that sets the theme's properties for the site's dark theme, and for its light one. */
export function themeStyle(): string {
	const colors = Object.entries(themeColors(notations));
	const properties = (theme: "light" | "dark") =>
		colors.map(([name, color]) => `--diagram-${name}: ${color[theme]};`).join(" ");
	// Starlight's pages are dark, unless the root element says that the reader's theme is light.
	return `:root { ${properties("dark")} }\n:root[data-theme="light"] { ${properties("light")} }`;
}
