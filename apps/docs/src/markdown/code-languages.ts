/**
 * The languages that the site colors code in. Starlight highlights code with
 * Shiki, whose MIT package carries a grammar for each language under that
 * grammar's own license, and a few of those are GPL-3.0, such as nginx's. The
 * site keeps to grammars under a permissive license (spec: Dependencies): code
 * in any other language shows as plain text, and its grammar is never loaded.
 *
 * A language joins the list once its grammar, and every grammar which that
 * one embeds, has a permissive license. The list of Shiki's grammars gives
 * each one's license and what it embeds:
 * https://github.com/shikijs/textmate-grammars-themes/blob/main/packages/tm-grammars/README.md
 */

import type { MdastPluginDefinition } from "satteri";

/**
 * Each language by the names a code fence may give it. All are MIT, most of
 * them from VS Code. HTML embeds JavaScript and CSS, and XML embeds Java,
 * which is MIT too.
 */
const permissive = new Set(
	[
		["typescript", "ts", "cts", "mts"],
		["tsx"],
		["javascript", "js", "cjs", "mjs"],
		["jsx"],
		["json"],
		["jsonc"],
		["json5"],
		["shellscript", "bash", "sh", "shell", "zsh"],
		["css"],
		["html"],
		["xml"],
		["diff"],
		["sql"],
		["go"],
	].flat(),
);

export const codeLanguages: MdastPluginDefinition = {
	name: "code-languages",
	code(node, ctx) {
		if (typeof node.lang === "string" && !permissive.has(node.lang.toLowerCase())) {
			ctx.setProperty(node, "lang", null);
		}
	},
};
