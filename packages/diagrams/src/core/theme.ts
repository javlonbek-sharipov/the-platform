/**
 * The theme: the semantic colors a Diagram is drawn in. Each one is a CSS
 * custom property, `--diagram-` and its name, with a fallback for the light
 * theme and one for the dark theme. A page that defines the properties wins in
 * both themes; a standalone SVG follows its viewer's theme.
 *
 * These are the colors that every Diagram shares. Each Notation's definition
 * adds a hue for each family of its Kinds.
 */

/** A color of the theme: its fallback for the light theme, and for the dark theme. */
export interface ThemeColor {
	light: string;
	dark: string;
}

export const palette = {
	background: { light: "#ffffff", dark: "#0d1117" },
	surface: { light: "#ffffff", dark: "#161b22" },
	border: { light: "#d1d9e0", dark: "#3d444d" },
	ink: { light: "#1f2328", dark: "#f0f6fc" },
	muted: { light: "#59636e", dark: "#9198a1" },
	accent: { light: "#bf3989", dark: "#db61a2" },
	ok: { light: "#1a7f37", dark: "#3fb950" },
	warn: { light: "#9a6700", dark: "#d29922" },
	danger: { light: "#d1242f", dark: "#f85149" },
	// An Edge's body, and the darker casing around it, which sets it apart
	// where it passes over another Edge.
	edge: { light: "#818b98", dark: "#9198a1" },
	"edge-casing": { light: "#424a53", dark: "#262c36" },
	// The casing of an Edge drawn in the warning color, darker than it.
	"warn-casing": { light: "#7d4e00", dark: "#4b2900" },
} as const satisfies Record<string, ThemeColor>;

export type ColorName = keyof typeof palette;
