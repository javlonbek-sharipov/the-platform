# 04: Text that fits everywhere

**What to build:** text in every Diagram looks the same on every machine, and never spills out of its Node.

- The engine bundles the Inter font, and measures text with metrics generated from it.
- A title too long for its Node is shortened with an ellipsis, and lint warns about it.
- Characters the font lacks also get a warning.
- Each SVG embeds a subset of the font that holds only the glyphs it uses.

**Blocked by:** 01 A Diagram from source to committed SVG.

**Status:** ready-for-agent

**Spec:**

- [Package and tooling](../spec.md#package-and-tooling): Bundled assets, Dependencies
- [Layout](../spec.md#layout): steps 1 and 2
- [Static SVG](../spec.md#static-svg): Self-contained, Determinism
- [Risks to check early](../spec.md#risks-to-check-early)

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Font**

- [x] Inter's static regular and semibold TrueType files ship in the package, with the SIL Open Font License text beside them.
- [x] A script generates, from those files, the metrics the core measures with. Running the script again gives the same output.

**Measuring and shortening**

- [x] Measurement ignores kerning and ligatures, and each SVG's style turns both off.
- [x] A title wider than its Node allows is shortened with an ellipsis, before it would touch anything else in the header.
  - The model keeps the full title.
  - Lint warns, and names the Node.
- [x] A character the font lacks is measured at an average width, and lint warns.

**Embedded subset**

- [x] The core works out which glyphs an SVG needs, and asks a function passed in by its caller for the font data.
- [x] The CLI's function subsets the bundled font, using either a permissively licensed library or our own TrueType subsetter.
- [x] Each SVG embeds exactly the glyphs it uses. A test reads the subset's character map to check this.
- [x] The embedded font's family name is derived from the SVG's contents.
- [x] Every selector in the SVG's style is scoped to that SVG.
- [x] The subset is byte-identical from run to run, so golden files stay stable.
- [x] The example Diagram's embedded subset is roughly 10–30 KB.

**Fallback and references**

- [x] The SVG's font stack falls back only to fonts no wider than Inter, such as Helvetica and Arial.
- [x] A test checks that no SVG has an external reference.

## Comments

**Implementation, 4 November 2026** (branch `t3/diagram-text-fonts`). Choices the spec left open are recorded in its "Decisions made during implementation".

- **Manual check, the font loads.** In headless Chrome 156, each subset loaded as a `FontFace`: the example's, all of Basic Latin and Latin-1 in both weights, and one with characters beyond the Basic Multilingual Plane. A broken font failed to load, so the check can fail.
- **Manual check, drawn text matches measured text.** I inlined the example and a fixture of 19 titles into a page. For every title, `getComputedTextLength()` was within 0.011 px of the scene's measured width. Kerning-prone and ligature-prone titles such as `AVATAR`, `Typography` and `a -> b` drew at exactly their measured widths. The one exception was `Tokyo 東京`: Inter lacks the CJK characters, and the system font that drew them made each about 4.9 px wider than the average width it was measured at. Lint warns about that title (`glyph-missing`).
- **Manual check, the fallback fonts.** Measured in the same Chrome, Helvetica and Arial are narrower than Inter overall, but not for every character. Spec decision 8 under ticket 04 has the numbers. A title's 12px of clearance on each side absorbs the difference.
- **Manual check, by eye.** Shown as an `<img>`, the example draws in Inter SemiBold. With its `@font-face` removed, it draws in Helvetica Bold instead. In both, every title stays inside its Node, and shortened titles end in `…`.
- **The example's subset** is 4.1 KB, or 5.4 KB in base64, and the whole SVG is 8.3 KB. That's under the spec's 10–30 KB estimate, because the subset has no hinting, glyph names or layout tables. A test keeps it under 30 KB.
- **Not checked: fonts on GitHub.** The repo has no GitHub remote yet, so the spec's first risk is still open. The research notes say `<img>` contexts accept `data:` fonts, and the raw view of an SVG doesn't.
- **Found, not fixed.** A title holding a C0 control character other than tab, line feed or carriage return still produces an SVG that isn't well-formed XML. That predates this ticket, and is left for validation to reject.
