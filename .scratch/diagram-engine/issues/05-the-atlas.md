# 05: The Atlas

**What to build:** lint checks the whole repo as one Atlas, so that no two Diagrams contradict each other.

- A config file at the repo root marks the Atlas.
- Every `.diagram.ts` in the repo belongs to the Atlas, except files that git ignores.
- One id can't have two Kinds or two titles.
- Links to ids, docs and headings must resolve.
- An SVG whose source is gone is an error.
- Messages point at the file and line, and agents can ask for them as JSON.
- Authors can define a Node once in a shared module and use it in several Diagrams.

**Blocked by:** 01 A Diagram from source to committed SVG.

**Status:** ready-for-agent

**Spec:**

- [The Atlas](../spec.md#the-atlas)
- [The authoring API](../spec.md#the-authoring-api)
- [The JSON model](../spec.md#the-json-model) (Link)
- [Lint](../spec.md#lint)
- [CLI](../spec.md#cli)
- [Seam 2](../spec.md#seam-2-the-cli-on-a-sample-atlas)

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Config and discovery**

- [x] The repo gets its `diagrams.config.ts`, written with a helper from the authoring API. The CLI finds the config from any working directory inside the repo.
- [x] The config's shape leaves room for the list of contexts and glossaries that slice 2 adds.
- [x] Discovery uses git's view of the repo, so ignored files, such as the reference clones, are skipped. Outside a git repo, it walks the folder tree and skips `node_modules`. This replaces ticket 01's temporary discovery.

**Loading and messages**

- [x] Modules load through Node's type stripping. A module that throws, or doesn't default-export a Diagram, is an error that names its file.
- [x] Each declaration records the file and line it was called from. Lint prints each message as `file:line:column: severity: message (rule)`.
- [x] `diagrams lint --json` prints the same messages as JSON.

**Links**

- [x] Nodes accept Links of two sorts, each with an optional label:
  - `id`, pointing at another id in the Atlas;
  - `doc`, pointing at a document, with an optional `section`.

  Term Links come in slice 2.

**Atlas checks**

- [x] Lint reports an error for each of these:
  - an id with two different Kinds across the Atlas;
  - an id with two different titles;
  - a Link to an unknown id;
  - a Link to a missing file, or to a heading that the file doesn't have;
  - a `.diagram.svg` with no source.

**Shared definitions**

- [x] A Node defined as a plain object in a shared module can be passed to several Diagrams.
- [x] A Seam 2 test shows that renaming the shared Node in its one place renames it on every Diagram, and lint still passes.

**Tests**

- [x] Seam 2 tests cover each error, a clean Atlas passing, the exit codes, and the JSON output.

## Comments

**Implementation, 4 November 2026** (branch `t3/atlas-lint-links`). Choices the spec left open are recorded in its "Decisions made during implementation".

- **Manual check, the reference clones.** In the repo, an untracked `repos/probe/` held a module that throws and an SVG with no source. `diagrams lint` passed, from the root and from `packages/diagrams/src`, so git kept both out of the Atlas. `--json` printed an empty message list.
- **Manual check, broken Links.** I gave the example Diagram's Orders API five Links: to an id that no Diagram draws, to an ADR section by its heading text, to the spec's "The Atlas", to a misspelled "The Atlass", and to `payments-api`. lint reported the misspelled heading and the unknown `inventory-api`, both at `example-system.diagram.ts:10:19`, which is the `node` in `d.node({`. The others resolved. Every spec anchor that this ticket links to also resolves by GitHub's rules, and the spec's second "Docs site" heading is `docs-site-1`.
- **Manual check, pre-commit hook.** A staged Diagram with a broken Link, rendered first so that its SVG matched, was blocked: Biome passed, then `diagrams lint` failed with the `broken-link` error, and no commit was made.
- **Manual check, Node 24.** The whole test suite passed on the official Node v24.22.2 binary, after checking the tarball against nodejs.org's SHASUMS. That covers its stack frames and syntax-error stacks, which the positions rely on.
- **Speed.** An Atlas of 100 Diagrams, each with 20 Nodes and two Links per Node, renders in 0.19 s and lints in 0.20 s.
- **Found by the new checks.** Ticket 01's sample modules all declared `shop-api`, titled after their Diagram, so the title check failed the old CLI tests. Each sample now names its API after its title.
- **Seen during review.** A Link to an id on a Diagram that has errors of its own was first reported as pointing nowhere. Ids now resolve against every Diagram that loaded, so only the real errors show. And a Link with both an `id` and a `term` passed validation, its term ignored; a term now counts as a target, and fails until slice 2.
- **For later tickets.** A diagnostic whose pointer lies under a declared Node or Edge, such as `/nodes/2/title`, gets that declaration's line, so ticket 04's warnings about shortened titles will too. Ticket 06 should record each Group's declaration the same way, under `/groups/…`, and pass Groups' Links to the Link check.

