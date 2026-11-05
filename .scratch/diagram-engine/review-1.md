# Code review 1: slice 1 on `diagram-engine`

Reviewed: `git diff main...diagram-engine` at 8df6e6f, by the `code-review` skill's two fresh reviewers, Standards and Spec. Their reports follow, lightly cleaned. After them come the orchestrator's decisions for the fix, and loose ends that the tickets found.

Paths are under `packages/diagrams/` unless they say otherwise.

## Standards

**Hard violations (documented standards)**

1. `src/core/svg.ts:352` `const groupOutlines: Record<string, Attribute[]> = {` puts the looks of Group Kinds in the SVG writer. The spec's Notations section says a Notation defines "how each Kind looks", and Node and Edge looks already live in `notations/architecture.ts`.
2. `src/index.ts` doesn't export `SceneLogo` (`scene.ts:100`), though the exported `SceneNode` and `SceneLabel` use it. The spec says the scene "is exported for tests and for future renderers".
3. `src/core/outlines.ts:286` uses `Math.floor(…)`, but ticket 07's decision 1 allows "addition, subtraction, multiplication and division only". This only breaks the wording, since floor is exact.

**Smells (judgement calls)**

- **Duplicated Code**: identical helpers in more than one place:
  - `heading`/`headingOf`/`unit` (`svg.ts:899`, `marks.ts:374`, `nudge.ts:1017`)
  - `list` (`text.ts:570`, `validate.ts:864`, `atlas/messages.ts:51`)
  - `codePointOf` (`text.ts:565`, `validate.ts:473`)
  - `snap`/`roundUp` (`layers.ts:87`, `layout.ts:309`)
  - the union-find, twice (`nudge.ts:535`, `nudge.ts:876`)
  - `parentOf` maps (`layout.ts:113`, `marks.ts:105`, `route.ts:160`)
  - "font has no `tag` table" (`truetype.ts:22`, `subset.ts:458`, `scripts/generate-font-metrics.ts:61`)
  - the slug regex (`scripts/generate-technologies.ts:108`, `validate.ts:42`)
  - the SVG-on-disk check, as text in `cli.ts:86` and as bytes in `atlas.ts:207`
- **Duplicated constants that can drift**:
  - `laneSpacing = 8` (`layout.ts:75`) vs `lanes.spacing` (`route.ts:87`)
  - `chevronReach`/`badgeReach` (`marks.ts:31–32`) repeat sizes in `svg.ts`, and nothing imports them
  - the `"target"` default is set twice (`layout.ts:84`, `route.ts:157`)
- **Shotgun Surgery**: `checkCharacters` (`validate.ts:361`) and `textDiagnostics` (`text.ts:377`) each walk every text field, and `colorUses` (`svg.ts:231`) works out again which classes the writers emit. So a new text means editing all three.
- **Data Clumps**:
  - `{ horizontal, line, low, high }` (`hops.ts:32`, `labels.ts:95`, `nudge.ts:56/71/107`)
  - `{ file, line, column }` as `SourcePosition`, `Place` and `AtlasMessage`
- **Primitive Obsession**:
  - `kind: string` (`scene.ts:58`) forces three cast-and-throw lookups (`svg.ts:538/566/743`)
  - `pinned = 3` (`nudge.ts:249`), though its doc comment says 0–2
  - a fake `kind: "service"` Node to size an empty Group (`layout.ts:111`)
- **Mysterious Name**:
  - `group` means a lane group right next to glossary Groups (`route.ts:161` vs `route.ts:271`)
  - `labelPadding` (`text.ts:58`) is the Group label's padding, next to the Edge label's `labelPaddingX`
- **Repeated Switches**: nine `down ?` axis swaps in `layout.ts:96–246`. Fix: pick the axes once.
- **Divergent Change**: `svg.ts` (984 lines, 28 commits) mixes XML writing, theme CSS, hashing, base64, fonts and Edge geometry.
- **Speculative Generality**: `congestion?:` (`search.ts:46`) is optional, but every caller passes it.

**Suppressed**: the tests' own TrueType, SVG and PNG readers, and `png.ts` re-parsing the SVG's CSS. Tickets 04, 07 and 13 approve both.

## Spec

**(a) Missing or partial**

1. **No Atlas index.** The spec says the Atlas "Builds the Atlas index" and "`diagrams export --index` writes the Atlas index". No ticket covers it, and `--index` exits 2 as an unknown option.
2. **No Node or Diagram `description`.** The spec says "Node: … Optional … `description`", and story 9 asks to "give a Node a description and Links". Decision 14.2 rejects both, which conflicts with the version 1 field list. It's also inconsistent: a Group `description`, which nothing reads either, is accepted (`src/core/validate.ts:74-92`, `diagram.schema.json`).
3. Ticket 15's manual agent check is still open, on purpose.

**(b) Scope creep**

- Decisions 11.2 and 11.6 add `--diagram-edge`, `--diagram-edge-casing` and `--diagram-warn-casing`. That widens a list the spec fixes ("`background`, `surface`, `border`, `ink` and `muted`; `accent`, `ok`, `warn` and `danger`; one hue for each family of Kinds"), and host pages must then define three more properties.
- The skill adds a `pnpm typecheck` step, as a workaround for (c)2.

**(c) Looks implemented, but wrong**

1. **`render` accepts any path.** The spec says it "Writes each `<name>.diagram.svg` next to its source."
   - `renderCommand` (`src/cli/cli.ts:77`) doesn't check the suffix or the Atlas, the way `export` does.
   - `svgFileOf` (`src/atlas/atlas.ts:60`) cuts 11 characters without checking them.
   - In a temp Atlas, `diagrams render docs/shop.ts` wrote `d.diagram.svg` at the root and exited 0. Lint then failed with `svg-orphaned`.
2. **Misspelled options vanish.** The spec says "Validation is the authority, not the types: everything the types prevent is also checked at run time." The builder copies only the fields it knows (`src/authoring/architecture.ts:159,196`). So a misspelled `lable` passes render and lint. Decision 15.4 admits it breaks the rule.
3. **The hook can commit a stale SVG.** Story 59 says "so that stale drawings can't be committed." `lefthook.yml` runs lint on the working tree, and lefthook 2.2.2 commands see a file's unstaged contents. So if you render, stage only the module and commit, lint passes and the old SVG is committed.
4. **Decisions that conflict with the main text:**
   - 13.6 replaces "the bundled font handed straight to the rasterizer", yet ticket 13 still ticks that box.
   - 11.6 draws crossing Edges first (`svg.ts:130`), against "elements are written in model order".
   - 06.5 makes only the title's label box an obstacle, against step 1's "Do the same around each Group label band". Ticket 06 still ticks "Label bands are obstacles".

## Also to fix: loose ends the tickets found

1. **Capacity and nudging disagree.** Drawn `down` with every Edge labeled, one 32 px corridor holds five lanes at the 4 px minimum. That's one more than the capacity rule (free width ÷ 8 px) allows, yet the router sees no overflow. See ticket 16's Comments.
2. **No test exports a PNG of a Diagram with Groups.** Ticket 13's merge checked it by hand only.

## Decisions for the fix

The orchestrator made these calls. Where a call amends the spec, change the spec's main text, record it under "Decisions made during implementation" (a **Review 1** entry), and correct any ticket checkbox wording that says otherwise.

- **Atlas index (Spec a1):** build it. `diagrams export --index` writes the index the spec's "The Atlas index" section describes, with its Diagrams and ids. The glossary-term list stays empty until slice 2 brings glossaries. Add the Seam 2 test the spec lists.
- **`description` (Spec a2):** accept it wherever the version 1 field list has it (Diagram, Node, Group): in the authoring API, validation and the schema. The model and its `<metadata>` carry it. Don't draw anything new unless the spec says to. Walkthroughs stay rejected until slice 4.
- **Extra theme properties (Spec b1):** keep them. Amend the spec's list of theme properties to include `edge`, `edge-casing` and `warn-casing`.
- **The skill's `pnpm typecheck` step (Spec b2):** once the builder rejects unknown options (c2), remove it, so that the skill finishes as the spec says.
- **`render` paths (Spec c1):** `render` accepts only `.diagram.ts` modules in the Atlas, as `export` does, and refuses anything else with exit 2.
- **Unknown options (Spec c2):** every authoring function rejects options it doesn't know, at run time, with a `model-shape` error at the call site, as validation does for JSON.
- **Stale SVGs in the hook (Spec c3):** the pre-commit check must judge what is being committed, not the working tree. It fails when the commit would hold an SVG that doesn't match its staged source. Choose the mechanism, and cover the render-then-stage-only-the-module case with a Seam 2 test in a temporary git repo.
- **Conflicting decisions (Spec c4):** keep all three decisions, and amend the spec's main text to match them (13.6, 11.6 and 06.5), along with the checkbox wording in tickets 13 and 06.
- **Standards 1–2:** move the Group Kinds' looks into the Notation, and export `SceneLogo`.
- **Standards 3:** amend ticket 07's decision 1 to allow what the spec's main text allows (rounding included), and keep the floor.
- **Smells:** fix each one unless the fix would leave the code worse. List any you skip, with the reason, under this file's `## Fix report`. Check `pinned = 3` first: it may be a bug.
- **Output:** refactors must leave every golden file and committed SVG byte-identical. Only a behaviour fix, the capacity one for instance, may change them, through the update command, with the reason recorded.

## Fix report

The fixer fills this in.
