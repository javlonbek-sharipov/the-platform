# 01: A Diagram from source to committed SVG

**What to build:** the thinnest complete path through the engine.

- An author writes a small architecture Diagram as a `.diagram.ts` module, using the typed authoring API.
- They run `diagrams render` and get a `.diagram.svg` beside the module.
- `diagrams lint` fails when a Diagram is invalid, or when its SVG is missing or no longer matches its source. The pre-commit hook runs it.

Every stage stays simple on purpose: a plain layout, straight or single-bend Edges, plain rectangles and text. Later tickets deepen layout, routing, text and looks behind the same interfaces.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

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

- [ ] The repo is a pnpm monorepo. It contains the private package `@the-platform/diagrams`, licensed `UNLICENSED`, and the repo root depends on that package.
- [ ] TypeScript runs on Node 24 with no build step, using erasable syntax only. Vitest runs the tests and Biome checks the code.
- [ ] Git ignores `node_modules` and the engine's cache folder.
- [ ] Generated SVGs are marked as LF-only text in git attributes, and are never git-ignored.
- [ ] A lefthook pre-commit hook runs Biome, then `diagrams lint`. Check by hand once that it blocks a commit with an out-of-date SVG.

**Authoring API and model**

- [ ] The architecture builder:
  - declares Nodes of the 12 architecture Kinds, and Edges of Kind `call` or `message`;
  - returns handles;
  - names each Edge that has no id after its two ends;
  - produces a version-1 JSON model, which the module default-exports.
- [ ] An unknown Kind is a type error (a Vitest type test) and also a validation error.

**Core**

- [ ] The core has a single entry point that takes a Diagram and returns diagnostics. When there are no errors, it also returns a scene and an SVG.
- [ ] Validation reports:
  - an unknown Kind;
  - a duplicate id;
  - an id that isn't lowercase kebab-case;
  - an Edge end that isn't a Node on the same Diagram.
- [ ] A minimal layout puts Nodes in ranks by longest path, and stacks each rank in declaration order.
- [ ] A minimal route joins the source's output Port to the target's input Port, with a straight line or a single bend.
- [ ] The SVG follows the spec's determinism rules. Rendering the same model twice gives identical bytes, and so does rendering it again after a round trip through JSON.
- [ ] Golden-file tests compare SVGs byte for byte. An explicit command updates the golden files.

**CLI**

- [ ] The CLI is a function that takes arguments, a working directory and output streams, and returns an exit code. The `diagrams` binary only calls that function.
- [ ] One smoke test runs the real binary.
- [ ] Seam 2 tests, each in a temporary folder:
  - `render` writes each SVG next to its source, and `lint` passes afterwards;
  - after a source is edited, `lint` fails and names the stale SVG;
  - after an SVG is deleted, `lint` fails and names it as missing;
  - an invalid Diagram gets no SVG, and the exit code is 1.
- [ ] Until ticket 05 brings in the Atlas, discovery walks the repo for `*.diagram.ts` files, skipping `.git`, `node_modules` and `repos/`.

**Example Diagram**

- [ ] The package's docs hold an example Diagram with its SVG. It shows a small example system: a client, a gateway, two services, a database and a queue. Later tickets extend it.
