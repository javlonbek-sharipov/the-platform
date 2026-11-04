# 10: Edge labels, rates and hops

**What to build:** readers can see what each Edge carries, and can tell crossing Edges apart.

- An Edge's label sits on that Edge's own longest straight run, with its Technology and rate below it.
- Labels stay clear of Nodes, Port stubs, Group labels and other labels.
- The gaps between ranks make room for labels.
- Where two Edges with different targets cross, one of them gets a small hop.

**Blocked by:**

- 02 Automatic layout
- 04 Text that fits everywhere
- 09 Shared corridors

**Status:** resolved

**Spec:**

- [Edge routing](../spec.md#edge-routing): steps 8 and 9
- [Layout](../spec.md#layout): step 6
- [The JSON model](../spec.md#the-json-model): Edge, Rules › Values

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Edge fields**

- [x] Edges accept `label`, `technology` and `rate`.
- [x] Until ticket 12 adds logos, a Technology shows as its name.
- [x] A `rate` that doesn't match the spec's format is a validation error.

**Label placement**

- [x] Each label is centered beside the longest straight run that belongs to its Edge alone, not to a shared trunk.
- [x] If the label would cover something there, it goes on the next-longest run.
- [x] If no run fits, it goes at the route's midpoint, and lint warns.
- [x] The gap between two ranks leaves room for the labels of the Edges that span it.
- [x] A label too long for its run is shortened with an ellipsis, and lint warns.

**Hops**

- [x] Where two Edges with different targets cross at a right angle, one of them gets a hop. A fixed rule decides which.
- [x] The scene stores each Edge's stroke as separate pieces between hops.

**Checks**

- [x] The Seam 1 properties hold:
  - no label overlaps a Node, a Group label or another label;
  - hops appear only where Edges with different targets cross.
- [x] The example Diagram gets labels on a few Edges, plus one Technology and one rate.

## Comments

**Implementation, 5 November 2026** (branch `t3/edge-labels-rates-hops`). Choices the spec left open are recorded in its "Decisions made during implementation", under Ticket 10.

- **Manual check, by eye.** I rendered labeled fixtures with the bundled font through resvg, as `diagrams export` does, and looked at them at 2× and 3×:
  - On the example, laid out right, each label sits 4 px above its run, centered in its gap between ranks: "Places orders" with `30/s` below it, "Creates orders" with `grpc`, "Announces orders", "Charges cards". Exported with `--theme dark`, the label boxes vanish into the background, the texts are light and the Technology and rate muted.
  - On Rows and callouts, laid out right and down, every label clears the Nodes, their tags and the Group labels. Laid out down, "Publishes events" first came out shortened on a short run, because the first pass took a run where it hid no route over its longest run, where it fitted in full but covered another route. That's why the passes now try "in full" before "shortened" (decision 3).
  - On two regions, laid out right, "Charges cards" first sat on a 44 px jog, because centering it on its 736 px run put it across the EU region's border. Splitting stretches at Group borders put it between the two regions, on its own run. The US API's Edge to its database is all trunk past its stub, so its label falls back to the midpoint, with a warning. That's the spec's rule for trunks.
  - In crops of the crowded fixture, hops show as gaps in the vertical runs where horizontal runs cross them, and a vertical run that passes a bundle of lanes breaks once, under all of them.
- **Manual check, lint.** A CLI test runs `lint` on a sample Atlas: a label that falls back to its route's midpoint, and one too long for its run, each get a warning at their `d.edge(` line, and lint passes.
- **What the properties found.** The label properties run on labeled copies of the Group fixtures, a fan-out and the crowded fixture, both directions. They led to splitting stretches at Group borders, and to the third pass. With every sixth Edge of the crowded fixture labeled, 5 of 25 labels fall back each way, all on Edges with no run of their own that holds them. With every Edge labeled, 44 and 36 of 148 do.
- **Crossings at corners.** In the crowded fixture, about 4% of crossings leave the run across the direction no room for a whole hop before an arc, and about 1% leave neither run room. That's why the hop rule is decided once per crossing point, over every route through it: deciding per pair broke one Edge of a trunk and not the other.
- **Speed.** `pnpm bench`: 84 ms median drawn right and 109 ms drawn down (86 and 132 before). With every Edge labeled, a render takes about 90 ms.
- **For ticket 11.** `writeEdge` draws `edge.stroke`, the route in pieces between hops, as the subpaths of one path. A casing and a body should both draw those pieces, so hops show in both; chevrons and flow marks can follow `edge.route`, which stays whole. Label texts go through `writeText`, inside a group that carries the text attributes, as Node and Group texts do.
- **For ticket 12.** A label's Technology is `label.technology`, its own scene text on the line below the label. `labelWidth` and `labelTexts` in `src/core/text.ts` measure and lay out that line; a logo goes before the Technology's text there.

Merged into diagram-engine in 3574db9.
