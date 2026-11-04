# 11: Edges show what they carry, and SVGs describe themselves

**What to build:** readers can tell kinds of communication apart, and see each Edge's direction at a glance.

- `call` Edges are solid and `message` Edges are dashed. Both get arrowheads, direction chevrons and a darker casing.
- A small junction mark sits where one Port splits into several Edges.
- An Edge that crosses between different `region` or `zone` Groups gets a warning color and a badge at its midpoint.
- Each SVG also describes itself: to screen readers, and by carrying its own JSON model.

**Blocked by:**

- 07 Architecture Nodes look like what they are
- 09 Shared corridors

**Status:** resolved

**Spec:**

- [Notations](../spec.md#notations): sentence forms
- [Notations › Architecture](../spec.md#architecture): Edges
- [Static SVG](../spec.md#static-svg): Look, Accessibility, Model and hooks

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Edge styles**

- [x] `call` and `message` Edges look different in both themes.
- [x] Every Edge has an arrowhead at its target, and chevrons at a fixed spacing along its route.
- [x] Every Edge is drawn as a body inside a darker casing.
- [x] Wherever one Port feeds two or more Edges, a junction mark sits over the split.
- [x] An Edge whose ends sit in different `region` Groups, or in different `zone` Groups, gets the warning color and a badge at its midpoint.

**Accessibility**

- [x] Each Edge Kind declares a sentence form in its Notation, such as "Checkout API calls Payments API".
- [x] The SVG's root has:
  - `role="img"`;
  - a `<title>` that holds the Diagram's title;
  - a `<desc>` that lists its Nodes, and its Edges in their sentence forms.

**Text baselines**

- [x] Every `<text>` sets its own `dominant-baseline`, or its own position, instead of inheriting one from a group. SVG 1.1 doesn't inherit it, so strict renderers such as resvg drew every text 5 px high. Once the SVG does this, remove PNG export's rule that patches it.
- [x] A Seam 1 test checks every `<text>` in every fixture, so text added by other tickets can't regress.

**Model**

- [x] The SVG carries its JSON model in a `<metadata>` element, so the SVG alone is enough for the web component in slice 3.
- [x] A Seam 1 test parses the metadata back and gets the model.

**Checks**

- [x] Golden files cover both Edge Kinds, a junction, and a cross-region Edge.
- [x] The example Diagram shows each of those.

## Comments

- Orchestrator: added **Model** here. Ticket 01 found that no slice 1 ticket covered the spec's `<metadata>` model (Static SVG › Model and hooks, and Testing Decisions › SVG).
- Orchestrator: added **Text baselines**. Ticket 13 found the problem; see its Comments ("For later tickets") and its decision on `dominant-baseline` in the spec.
- Orchestrator: ticket 10's Comments end with a note for this ticket ("For ticket 11"), on drawing an Edge's stroke pieces between hops. Read it when you merge ticket 10's work.

**Implementation, 5 November 2026** (branch `t3/diagram-edges-carry-labels`). Choices the spec left open are recorded in its "Decisions made during implementation", under Ticket 11.

- **Manual check, by eye.** I rendered the example, the order-flow fixture (`test/fixtures/edges.ts`) and the crowded fixture through resvg, as `diagrams export` does, and looked at them at 1× to 8×, in both themes:
  - Calls are solid and messages dashed, each a gray body in a darker casing, with an arrowhead at the target and chevrons pointing along it. In the dark theme the casing nearly vanishes into the background, so it sets an Edge apart where it passes over another without making it heavier.
  - On the order flow, the Orders API's three Edges leave its Port together: a dot where the message turns off, 12 px out, another where the call to the Stock API turns off, 8 px further, and the call to the database runs straight on.
  - The call across zones and the messages across regions are amber, with a globe on an amber disc in the middle of the stretch that's theirs alone. Where they share a Port's stub with a plain Edge, the stub stays gray.
  - On the crowded fixture, hops break casing and body alike, no chevron sits in a hop's gap or under a label, and the gateway's fan-out shows a row of dots, one where each Edge leaves. Busy, but each one is a real split.
- **Manual check, in Chrome.** Chrome 156, headless, drew the example SVG as resvg does: as an `<img>` in a light page, and opened on its own with a dark color scheme preferred. Texts sit on their points in both.
- **Found by looking, and fixed.** Chevrons 64 px apart cluttered the long dashed lines, so they're 128 apart. The light theme's warning casing, #633c01, made amber Edges read as brown at 1×, so it's #7d4e00.
- **What the properties found.**
  - Two Edges sharing a trunk got chevrons a rounding error apart, 1343.9999999999998 against 1344, because each was measured forward from its own source. Measuring back from the target, walking back, made them identical.
  - One Edge put a chevron 12 px past the corner where another joins its trunk, and the other left it out for its corner's sake, so the later line would have covered half of it. Now a chevron keeps clear of every corner on its line, whichever Edge turns there.
  - After merging ticket 10, chevrons fell in hops' gaps and under labels, and badges under labels. Both now keep clear.
- **One Edge without chevrons.** Every Edge has its arrowhead, and every Edge of the example and the order flow has chevrons, which a test checks. On the crowded fixture drawn `right`, one 96 px call has none: its Port's other Edges run along 64 px of it, leaving 24 px between its last junction and its arrowhead, where a chevron would crowd both. I ticked the box with that exception, since the arrowhead shows its direction there.
- **Text baselines.** With export's patch removed first, the export test that reads each text's ink from the PNG failed, every text 5.125 px high. With each text setting its own baseline, it passes again.
- **Speed.** The crowded fixture's SVG grew from 186 KB to 464 KB, and hashing it for the scope's name with BigInts took 34 of the 36 ms the writer needed. The same hash on 16-bit limbs gives byte-identical files, and the writer now takes about 4 ms.
- **Merging ticket 10.** The casing and the body draw the stroke's pieces between hops, written from the target back, and ticket 10's SVG test for pieces now reads both. Label texts set their own baselines, as every text does. The description says each Edge's Technology, rate and label, as the spec's sentence form "Checkout API calls Payments API over gRPC: authorize" does, since a label's text inside an image is hidden from screen readers.
- **Not checked:** a screen reader reading the description aloud, and GitHub's rendering, since the repo has no remote yet.
- **For later tickets.**
  - Ticket 12: the description names a Technology by its slug, in `sentenceOf` in `src/core/description.ts`. That's where a display name would go.
  - Ticket 16: labels are placed before the marks, so a badge moves along its own stretch to clear labels, but no label moves for a badge. When an Edge's own stretch is all label, the label covers its badge. A label that kept clear of the badge's 8 px would fix it.
  - Slice 3, the web component: the model is in `<metadata>`, as JSON with sorted fields. `sentenceOf` gives the Edges' sentences for the screen-reader list. An Edge that crosses has `data-crosses="region"` or `"zone"`, and a junction's dot has `data-from`, with `data-from-row` for a Row's Port, so focus can keep it with its Edges.
  - Slice 4, flow animation: an Edge's line is written from its target back, so marks that flow toward the target run against the path's direction. They can follow `route`, which runs from the source.

Merged into diagram-engine in 03b6062.
