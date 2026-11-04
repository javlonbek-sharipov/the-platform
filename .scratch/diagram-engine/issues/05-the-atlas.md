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

- [ ] The repo gets its `diagrams.config.ts`, written with a helper from the authoring API. The CLI finds the config from any working directory inside the repo.
- [ ] The config's shape leaves room for the list of contexts and glossaries that slice 2 adds.
- [ ] Discovery uses git's view of the repo, so ignored files, such as the reference clones, are skipped. Outside a git repo, it walks the folder tree and skips `node_modules`. This replaces ticket 01's temporary discovery.

**Loading and messages**

- [ ] Modules load through Node's type stripping. A module that throws, or doesn't default-export a Diagram, is an error that names its file.
- [ ] Each declaration records the file and line it was called from. Lint prints each message as `file:line:column: severity: message (rule)`.
- [ ] `diagrams lint --json` prints the same messages as JSON.

**Links**

- [ ] Nodes accept Links of two sorts, each with an optional label:
  - `id`, pointing at another id in the Atlas;
  - `doc`, pointing at a document, with an optional `section`.

  Term Links come in slice 2.

**Atlas checks**

- [ ] Lint reports an error for each of these:
  - an id with two different Kinds across the Atlas;
  - an id with two different titles;
  - a Link to an unknown id;
  - a Link to a missing file, or to a heading that the file doesn't have;
  - a `.diagram.svg` with no source.

**Shared definitions**

- [ ] A Node defined as a plain object in a shared module can be passed to several Diagrams.
- [ ] A Seam 2 test shows that renaming the shared Node in its one place renames it on every Diagram, and lint still passes.

**Tests**

- [ ] Seam 2 tests cover each error, a clean Atlas passing, the exit codes, and the JSON output.
