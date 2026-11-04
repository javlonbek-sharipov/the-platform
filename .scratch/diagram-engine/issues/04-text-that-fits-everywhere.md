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

- [ ] Inter's static regular and semibold TrueType files ship in the package, with the SIL Open Font License text beside them.
- [ ] A script generates, from those files, the metrics the core measures with. Running the script again gives the same output.

**Measuring and shortening**

- [ ] Measurement ignores kerning and ligatures, and each SVG's style turns both off.
- [ ] A title wider than its Node allows is shortened with an ellipsis, before it would touch anything else in the header.
  - The model keeps the full title.
  - Lint warns, and names the Node.
- [ ] A character the font lacks is measured at an average width, and lint warns.

**Embedded subset**

- [ ] The core works out which glyphs an SVG needs, and asks a function passed in by its caller for the font data.
- [ ] The CLI's function subsets the bundled font, using either a permissively licensed library or our own TrueType subsetter.
- [ ] Each SVG embeds exactly the glyphs it uses. A test reads the subset's character map to check this.
- [ ] The embedded font's family name is derived from the SVG's contents.
- [ ] Every selector in the SVG's style is scoped to that SVG.
- [ ] The subset is byte-identical from run to run, so golden files stay stable.
- [ ] The example Diagram's embedded subset is roughly 10–30 KB.

**Fallback and references**

- [ ] The SVG's font stack falls back only to fonts no wider than Inter, such as Helvetica and Arial.
- [ ] A test checks that no SVG has an external reference.
