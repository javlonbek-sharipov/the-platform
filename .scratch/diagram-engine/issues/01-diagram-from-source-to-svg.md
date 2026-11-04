# 01: A Diagram from source to committed SVG

**What to build:** the thinnest complete path through the engine.

- An author writes a small architecture Diagram as a `.diagram.ts` module, using the typed authoring API.
- They run `diagrams render` and get a `.diagram.svg` beside the module.
- `diagrams lint` fails when a Diagram is invalid, or when its SVG is missing or no longer matches its source. The pre-commit hook runs it.

Every stage stays simple on purpose: a plain layout, straight or single-bend Edges, plain rectangles and text. Later tickets deepen layout, routing, text and looks behind the same interfaces.

**Blocked by:** None (can start immediately).

**Status:** resolved

**Spec sections:**

- [Order of work](../spec.md#order-of-work)
- [Package and tooling](../spec.md#package-and-tooling)
- [Modules](../spec.md#modules)
- [The JSON model](../spec.md#the-json-model)
- [The authoring API](../spec.md#the-authoring-api)
- [Static SVG](../spec.md#static-svg) (Determinism)
- [CLI](../spec.md#cli)
- [Testing Decisions](../spec.md#testing-decisions)

**Clean-room:** work only from the spec and the other sources that its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Repo and tooling**

- [x] The repo is a pnpm monorepo. It contains the private package `@the-platform/diagrams`, licensed `UNLICENSED`, and the repo root depends on that package.
- [x] TypeScript runs on Node 24 with no build step, using erasable syntax only. Vitest runs the tests and Biome checks the code.
- [x] Git ignores `node_modules` and the engine's cache folder.
- [x] Generated SVGs are marked as LF-only text in git attributes, and are never git-ignored.
- [x] A lefthook pre-commit hook runs Biome, then `diagrams lint`. Check by hand once that it blocks a commit with an out-of-date SVG.

**Authoring API and model**

- [x] The architecture builder:
  - declares Nodes of the 12 architecture Kinds, and Edges of Kind `call` or `message`;
  - returns handles;
  - names each Edge that has no id after its two ends;
  - produces a version-1 JSON model, which the module default-exports.
- [x] An unknown Kind is a type error (a Vitest type test) and also a validation error.

**Core**

- [x] The core has a single entry point that takes a Diagram and returns diagnostics. When there are no errors, it also returns a scene and an SVG.
- [x] Validation reports:
  - an unknown Kind;
  - a duplicate id;
  - an id that isn't lowercase kebab-case;
  - an Edge end that isn't a Node on the same Diagram.
- [x] A minimal layout puts Nodes in ranks by longest path, and stacks each rank in declaration order.
- [x] A minimal route joins the source's output Port to the target's input Port, with a straight line or a single bend.
- [x] The SVG follows the spec's determinism rules. Rendering the same model twice gives identical bytes, and so does rendering it again after a round trip through JSON.
- [x] Golden-file tests compare SVGs byte for byte. An explicit command updates the golden files.

**CLI**

- [x] The CLI is a function that takes arguments, a working directory and output streams, and returns an exit code. The `diagrams` binary only calls that function.
- [x] One smoke test runs the real binary.
- [x] Seam 2 tests, each in a temporary folder:
  - `render` writes each SVG next to its source, and `lint` passes afterwards;
  - after a source is edited, `lint` fails and names the stale SVG;
  - after an SVG is deleted, `lint` fails and names it as missing;
  - an invalid Diagram gets no SVG, and the exit code is 1.
- [x] Until ticket 05 brings in the Atlas, discovery walks the repo for `*.diagram.ts` files, skipping `.git`, `node_modules` and `repos/`.

**Example Diagram**

- [x] The package's docs hold an example Diagram with its SVG. It shows a small example system: a client, a gateway, two services, a database and a queue. Later tickets extend it.

## Comments

**Implementation, 4 November 2026** (branch `t3/diagram-source-to-svg`). Choices the spec left open are recorded in its "Decisions made during implementation".

- **Manual check, pre-commit hook.** I edited the example Diagram's source and staged it without rendering, then tried to commit. Biome passed, then `diagrams lint` failed with ``packages/diagrams/docs/example-system.diagram.svg: error: The SVG no longer matches its source. Run `diagrams render`. (svg-out-of-date)``, and the commit didn't happen.
- **Manual check, fresh clone.** In a fresh clone, `pnpm install` installed the hook through the root `prepare` script. `diagrams lint` and every test passed on the checked-out files.
- **Manual check, Node 24.** Only Node 26 is installed here, so I ran the official Node v24.22.2 binary separately. With it, the `diagrams` binary, the pnpm shim and the whole test suite all passed, with no warnings.
- **Manual check, by eye.** I rasterized the example SVG in Chrome, as an image on white and on GitHub's dark background. It shows plain rectangles and text, with straight or single-bend Edges, and is legible on both. With a single bend, an Edge's last run lies along its target's input side; ticket 03's routing replaces that.
- **Hooks and worktrees.** Git worktrees share one hooks folder, so `pnpm install` in any worktree installs the hook for all of them. On a branch without `lefthook.yml`, the hook only prints that it found no config, and the commit goes ahead.
- **Biome and SVGs.** Biome 2.6 lints SVG files and flags the missing `<title>`, which ticket 11 adds. Biome skips generated SVGs (`*.diagram.svg` and the golden files), so it never reformats them.
- **Not covered by any slice 1 ticket.** The spec's `<metadata>` element, which carries the JSON model in each SVG (Static SVG › Model and hooks), isn't in any ticket. The data attributes on each `<g>` are in place.
- **Until ticket 02.** A generated model with `direction: "down"` passes validation but is laid out left to right.

Merged into diagram-engine in 57319ce.
