/**
 * PNG export: an engine-made SVG drawn by resvg. Only the CLI uses it, since
 * resvg is MPL-2.0, which the spec allows only for an unmodified dependency
 * of the CLI.
 */

import { Resvg } from "@resvg/resvg-js";

export const themes = ["light", "dark"] as const;
export type Theme = (typeof themes)[number];

export interface PngOptions {
	theme: Theme;
	/** How many pixels the PNG has for each unit of the SVG's width and height. */
	scale: number;
}

/** Draws an engine-made SVG as a PNG, in one theme. */
export function drawPng(svg: string, { theme, scale }: PngOptions): Uint8Array {
	return new Resvg(themed(svg, theme), {
		fitTo: { mode: "zoom", value: scale },
		font: { loadSystemFonts: false },
	})
		.render()
		.asPng();
}

/** A rule of the SVG's style: its selectors, as written, and its declarations. */
interface Rule {
	selectors: string;
	declarations: [property: string, value: string][];
}

/**
 * The SVG with its style in a form resvg draws. resvg reads neither `var()`
 * nor `@media`, so each `var(--diagram-…, fallback)` becomes its fallback,
 * and for the dark theme, the rules in the `prefers-color-scheme: dark` block
 * take the place of the rules with the same selectors before it. Every other
 * at-rule, such as `@font-face`, goes: resvg would skip it anyway.
 */
function themed(svg: string, theme: Theme): string {
	const open = "<style>";
	const close = "</style>";
	const start = svg.indexOf(open);
	const end = svg.indexOf(close, start);
	if (start < 0 || end < 0) {
		return svg;
	}
	const rules: Rule[] = [];
	const dark = new Map<string, Rule>();
	for (const { prelude, body } of blocks(svg.slice(start + open.length, end))) {
		if (/^@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)$/.test(prelude)) {
			for (const block of blocks(body)) {
				dark.set(block.prelude, rule(block));
			}
		} else if (!prelude.startsWith("@")) {
			rules.push(rule({ prelude, body }));
		}
	}
	const chosen = theme === "light" ? rules : rules.map((it) => dark.get(it.selectors) ?? it);
	const style = chosen.map(
		({ selectors, declarations }) =>
			`${selectors} { ${declarations.map(([property, value]) => `${property}: ${resolved(value)};`).join(" ")} }`,
	);
	return `${svg.slice(0, start)}${open}\n${style.join("\n")}\n${close}${svg.slice(end + close.length)}`;
}

/** The top-level blocks of a style sheet, each with what comes before its brace. */
function blocks(css: string): { prelude: string; body: string }[] {
	const found: { prelude: string; body: string }[] = [];
	for (let at = 0; ; ) {
		const open = css.indexOf("{", at);
		if (open < 0) {
			return found;
		}
		let depth = 0;
		let close = open;
		for (; close < css.length; close++) {
			depth += css[close] === "{" ? 1 : css[close] === "}" ? -1 : 0;
			if (depth === 0) {
				break;
			}
		}
		found.push({ prelude: css.slice(at, open).trim(), body: css.slice(open + 1, close) });
		at = close + 1;
	}
}

function rule({ prelude, body }: { prelude: string; body: string }): Rule {
	const declarations = body.split(";").flatMap((declaration): [string, string][] => {
		const colon = declaration.indexOf(":");
		return colon < 0
			? []
			: [[declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()]];
	});
	return { selectors: prelude, declarations };
}

/** A value with each `var(--name, fallback)` replaced by its fallback. */
function resolved(value: string): string {
	const start = value.indexOf("var(");
	if (start < 0) {
		return value;
	}
	let depth = 0;
	let end = start + "var".length;
	for (; end < value.length; end++) {
		depth += value[end] === "(" ? 1 : value[end] === ")" ? -1 : 0;
		if (depth === 0) {
			break;
		}
	}
	const inside = value.slice(start + "var(".length, end);
	const comma = inside.indexOf(",");
	if (comma < 0) {
		throw new Error(`${value} has no fallback, so resvg can't draw it`);
	}
	return `${value.slice(0, start)}${resolved(inside.slice(comma + 1).trim())}${resolved(value.slice(end + 1))}`;
}
