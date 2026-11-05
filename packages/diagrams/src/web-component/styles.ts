/**
 * The component's own style sheet, shared by every `<platform-diagram>` on a
 * page. It lives in each one's shadow root, so the page's styles and the
 * component's never meet. It holds the rules for the stage, and each part's
 * own.
 */

import { type ColorName, palette } from "../core/theme.ts";
import { parts } from "./parts.ts";
import { tooltipCss } from "./tooltip.ts";

/**
 * The colors that all Diagrams share, as the stage's own properties:
 * `--theme-ink` is the page's `--diagram-ink`, or the fallback that the SVG
 * draws with where the page sets none. So a rule writes `var(--theme-ink)`,
 * and follows the page and the reader's color scheme as the drawing does.
 */
function themeOf(scheme: "light" | "dark"): string {
	return (Object.keys(palette) as ColorName[])
		.map((name) => `\t--theme-${name}: var(--diagram-${name}, ${palette[name][scheme]});`)
		.join("\n");
}

const css = `
:host {
	display: block;
}
:host([hidden]) {
	display: none;
}
.stage {
${themeOf("light")}
	position: relative;
	height: 100%;
	overflow: hidden;
	/* The SVG's own height is worked out from the stage's width. */
	container-type: inline-size;
	/* Around the drawing, the stage is the color of the drawing's own background. */
	background: var(--theme-background);
}
@media (prefers-color-scheme: dark) {
	.stage {
${themeOf("dark")}
	}
}
/* The mark of the keyboard's focus is drawn inside the stage, where nothing around it can clip it. */
.stage:focus-visible {
	outline: 2px solid var(--theme-accent);
	outline-offset: -2px;
}
/*
 * The SVG fills the stage. Where the page gives the component a height, that
 * is the stage's, and the SVG's. Where it doesn't, the percentages count for
 * nothing, and the SVG is as high as the component sets it: the stage, and
 * the component around it, are then as high as the SVG. It stops short of the
 * window's height, so that the page can always be scrolled past it.
 */
.stage > svg {
	display: block;
	width: 100%;
	min-height: 100%;
	max-height: 100%;
}
`;

export const styles = new CSSStyleSheet();
styles.replaceSync([css, tooltipCss, ...parts.map((part) => part.css ?? "")].join(""));
