/**
 * PNG export: an engine-made SVG drawn by resvg. Only the CLI uses it, since
 * resvg is MPL-2.0, which the spec allows only for an unmodified dependency
 * of the CLI.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

export const themes = ["light", "dark"] as const;
export type Theme = (typeof themes)[number];

export interface PngOptions {
	theme: Theme;
	/** How many pixels the PNG has for each unit of the SVG's width and height. */
	scale: number;
}

/**
 * Draws an engine-made SVG as a PNG, in one theme.
 *
 * Its text is drawn in the SVG's own font faces: the subset of the bundled
 * font that the SVG embeds. resvg reads no `@font-face` and takes fonts only
 * as files, so the faces go into a temporary folder for it. The bundled files
 * themselves won't do: resvg would apply their contextual alternates, which
 * the subset leaves out and which resvg can't be told to skip. Inter's
 * alternates turn `->` into an arrow, so the PNG's text would no longer match
 * the SVG's. With system fonts off, the faces are all that resvg has, so
 * every text falls back to their family.
 */
export function drawPng(svg: string, { theme, scale }: PngOptions): Uint8Array {
	const { drawn, faces } = forResvg(svg, theme);
	const folder = mkdtempSync(join(tmpdir(), "diagrams-fonts-"));
	try {
		const fontFiles = faces.map((face, index) => {
			const file = join(folder, `${index}.ttf`);
			writeFileSync(file, face);
			return file;
		});
		return new Resvg(drawn, {
			fitTo: { mode: "zoom", value: scale },
			font: { loadSystemFonts: false, fontFiles },
		})
			.render()
			.asPng();
	} finally {
		rmSync(folder, { recursive: true, force: true });
	}
}

/** A rule of the SVG's style: its selectors, as written, and its declarations. */
interface Rule {
	selectors: string;
	declarations: [property: string, value: string][];
}

/**
 * The SVG in a form resvg draws, and the font faces it embeds. resvg reads
 * neither `var()` nor `@media`, so each `var(--diagram-…, fallback)` becomes
 * its fallback, and for the dark theme, the rules in the
 * `prefers-color-scheme: dark` block take the place of the rules with the
 * same selectors before it. Every at-rule goes, `@font-face` included, since
 * resvg would skip it anyway.
 */
function forResvg(svg: string, theme: Theme): { drawn: string; faces: Uint8Array[] } {
	const open = "<style>";
	const close = "</style>";
	const start = svg.indexOf(open);
	const end = svg.indexOf(close, start);
	if (start < 0 || end < 0) {
		return { drawn: svg, faces: [] };
	}
	const rules: Rule[] = [];
	const dark = new Map<string, Rule>();
	const faces: Uint8Array[] = [];
	for (const { prelude, body } of blocks(svg.slice(start + open.length, end))) {
		if (/^@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)$/.test(prelude)) {
			for (const block of blocks(body)) {
				dark.set(block.prelude, rule(block));
			}
		} else if (prelude === "@font-face") {
			const data = /url\(\s*"data:font\/ttf;base64,([A-Za-z0-9+/=]+)"\s*\)/.exec(body)?.[1];
			if (data === undefined) {
				throw new Error(`The SVG has a font face that isn't TrueType data: ${body.slice(0, 80)}`);
			}
			faces.push(new Uint8Array(Buffer.from(data, "base64")));
		} else if (!prelude.startsWith("@")) {
			rules.push(rule({ prelude, body }));
		}
	}
	const chosen = theme === "light" ? rules : rules.map((it) => dark.get(it.selectors) ?? it);
	const style = chosen.map(resolvedText).join("\n");
	return {
		drawn: `${svg.slice(0, start)}${open}\n${style}\n${close}${svg.slice(end + close.length)}`,
		faces,
	};
}

/** A rule as text, with each `var()` in it resolved. */
function resolvedText({ selectors, declarations }: Rule): string {
	const body = declarations.map(([property, value]) => `${property}: ${resolved(value)};`);
	return `${selectors} { ${body.join(" ")} }`;
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
