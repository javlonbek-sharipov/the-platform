# 13: PNG and JSON export

**What to build:** an agent, or a person, can look at a Diagram as a picture.

- `diagrams export <diagram> --format png` writes a PNG, in the light or dark theme, at a chosen scale.
- `--format json` writes the JSON model instead.
- By default the file goes into a folder that git ignores, and the command prints its path.

**Blocked by:**

- 05 The Atlas
- 07 Architecture Nodes look like what they are

**Status:** resolved

**Spec:**

- [CLI](../spec.md#cli): `export`
- [Package and tooling](../spec.md#package-and-tooling): Dependencies

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Rendering**

- [x] The PNG is drawn from the same SVG, with:
  - the theme properties resolved to the chosen theme's colors;
  - the font faces that the SVG embeds, its subset of the bundled font, handed to the rasterizer (decision 6);
  - no animation.

**Options**

- [x] `--theme light|dark`, `--scale n` and `--out path` work.
- [x] The default output folder is ignored by git.
- [x] The command prints the file's absolute path.

**Dependency**

- [x] The rasterizer is permissively licensed. MPL-2.0 is acceptable if it's unmodified and used only by the CLI.
- [x] It installs on macOS and Linux without extra system packages.

**Seam 2 tests**

- [x] Exporting a sample Diagram writes a PNG whose header gives the expected width and height for the scale.
- [x] `--format json` writes a model equal to the module's default export.
- [x] Exporting an invalid Diagram fails and prints its errors.

**Manual check**

- [x] Once, by eye: the PNG's text uses Inter and matches the SVG. Note the result in this ticket's comments.

## Comments

**Implementation, 5 November 2026** (branch `t3/diagram-png-json-export`). Choices the spec left open are recorded in its "Decisions made during implementation".

- **Manual check, by eye.** I exported the example Diagram and both golden fixtures at 2×, in both themes, and compared each PNG with Chrome 156's rendering of the same SVG as an `<img>`, with the color scheme forced each way. The PNG's text is Inter, and it matches the SVG: each of the example's 18 texts has its ink in the same box in both, within one pixel at 2×, and side by side the drawings look the same. Between 0.16% and 0.25% of pixels differ by more than a quarter of their range, all along anti-aliased edges.
- **Found by that check, and fixed.** At first the text differed in two ways, and each now has a test.
  - Given the bundled TTFs, resvg applied Inter's contextual alternates, so `->` became a narrower arrow. Export now hands resvg the SVG's own subset, which has none (decision 6).
  - Every text sat 5 px high. resvg takes `dominant-baseline` from a parent only, and the SVG sets it two levels up (decision 7).
- **Manual check, Linux.** In containers with nothing added, on Debian 13 (arm64 and amd64) and Alpine (arm64, musl), `pnpm install --frozen-lockfile` picked resvg's prebuilt binary for each, and `diagrams export` wrote the example's PNG. With git added, for the tests that use it, the whole suite passed on all three. Without git, the repo's own `prepare` script fails, since lefthook needs git, but only after the dependencies are installed.
- **Licenses.** The workspace's only runtime dependencies are `@resvg/resvg-js` and its platform package, both MPL-2.0, and neither is patched. Biome rejects an import of resvg outside `src/cli/`.
- **Not checked:** macOS on Intel, and Windows. resvg ships binaries for both, but I had neither.
- **For later tickets.**
  - Ticket 15: the skill can tell agents to read the PNG at the path that `diagrams export` prints. Messages go to stderr, so stdout holds only that path.
  - Slice 4: export drops every at-rule, `@keyframes` included, and resvg would skip them anyway. Flow marks would still be drawn where they start, so decide whether the PNG shows them.
  - The SVG writer sets `dominant-baseline` on the group around all Nodes, and relies on its texts inheriting it. CSS says they do; SVG 1.1 says they don't, so a renderer that follows it, as resvg does past one level, draws the text 5 px high. Setting it on each `<text>` would fix that, and export's rule for it could go.
  - `diagrams export --index`, for the Atlas index, is still to come. Until then `--index` is an unknown option.

Merged into diagram-engine in 0ed0ef8.
