# 13: PNG and JSON export

**What to build:** an agent, or a person, can look at a Diagram as a picture.

- `diagrams export <diagram> --format png` writes a PNG, in the light or dark theme, at a chosen scale.
- `--format json` writes the JSON model instead.
- By default the file goes into a folder that git ignores, and the command prints its path.

**Blocked by:**

- 05 The Atlas
- 07 Architecture Nodes look like what they are

**Status:** ready-for-agent

**Spec:**

- [CLI](../spec.md#cli): `export`
- [Package and tooling](../spec.md#package-and-tooling): Dependencies

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Rendering**

- [ ] The PNG is drawn from the same SVG, with:
  - the theme properties resolved to the chosen theme's colors;
  - the bundled font handed straight to the rasterizer;
  - no animation.

**Options**

- [ ] `--theme light|dark`, `--scale n` and `--out path` work.
- [ ] The default output folder is ignored by git.
- [ ] The command prints the file's absolute path.

**Dependency**

- [ ] The rasterizer is permissively licensed. MPL-2.0 is acceptable if it's unmodified and used only by the CLI.
- [ ] It installs on macOS and Linux without extra system packages.

**Seam 2 tests**

- [ ] Exporting a sample Diagram writes a PNG whose header gives the expected width and height for the scale.
- [ ] `--format json` writes a model equal to the module's default export.
- [ ] Exporting an invalid Diagram fails and prints its errors.

**Manual check**

- [ ] Once, by eye: the PNG's text uses Inter and matches the SVG. Note the result in this ticket's comments.
