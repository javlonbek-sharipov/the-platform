# 02: Automatic layout

**What to build:** Diagrams lay themselves out readably, without any coordinates in the source.

- Nodes fall into ranks along the Diagram's direction.
- Edge crossings are reduced.
- Declaration order settles every tie, so a small edit to the source moves things only a little.
- Authors can choose `down` instead of the default `right`.

**Blocked by:** 01 A Diagram from source to committed SVG.

**Status:** resolved

**Spec:**

- [Layout](../spec.md#layout). Groups come in ticket 06.
- [Ports](../spec.md#ports)
- [Seam 1](../spec.md#seam-1-the-core-in-memory)

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Ranks**

- [x] Cycles are found by a depth-first search that starts from the Nodes in declaration order. An Edge that leads back into the current search path is left out of ranking, but is still drawn.
- [x] Each Node's rank is the length of the longest path that reaches it. Self-loops are ignored, and parallel Edges count once.
- [x] An Edge that spans several ranks gets a placeholder in each rank it passes.

**Order within ranks**

- [x] Crossings are reduced with a fixed number of forward and backward sweeps:
  - each sweep sorts each rank by the average position of its neighbors in the rank before it;
  - ties keep the current order;
  - the order with the fewest crossings wins, and on a tie the earlier one does.

**Coordinates**

- [x] Ranks become columns for `right` and rows for `down`.
- [x] Within a rank, members are:
  - centered on the rank's line;
  - at least the clearance apart;
  - aligned with the Nodes they connect to, where that keeps both the order and the clearance;
  - snapped to a small grid.
- [x] With `down`, input Ports sit on top and output Ports at the bottom.

**Checks**

- [x] The Seam 1 properties hold, in both directions, on fixtures for: a chain, a fan-out, a fan-in, a diamond, a cycle, and two disconnected parts. The properties are:
  - no two Nodes overlap or enter each other's clearance;
  - every Edge's target ranks after its source, except for Edges that close a cycle.
- [x] Declaring two unconnected Nodes of one rank in the opposite order swaps their positions within that rank.
- [x] A fixture whose declaration order alone would produce crossings is laid out with fewer crossings.
- [x] Layout uses only the arithmetic the spec allows: addition, subtraction, multiplication, division, square root, rounding, min and max.
- [x] The example Diagram is rendered again with the new layout.

## Comments

**Implementation, 4 November 2026** (branch `t3/diagram-auto-layout`). Choices the spec left open are recorded in its "Decisions made during implementation".

- **Manual check, by eye.** I rendered the example Diagram, the every-kind golden fixture, and a 12-Node fixture with a fan-out, a fan-in and an Edge that skips two ranks, in both directions, and looked at them in headless Chrome. Ranks run as columns for `right` and as rows for `down`. Chains run straight, each fan lines up with one of its middle Nodes, and the skipping Edge keeps a lane of its own beside the Nodes it passes.
- **Manual check, small edits.** On the example Diagram, adding a database behind the Payments API, or a second API behind the gateway, moved no existing Node. Declaring the queue first moved it above the database, and the Payments API with it.
- **Manual check, the arithmetic rule.** A probe file in the core that used `Math.cos`, `Math.PI`, `**`, `**=` and `const { tan } = Math` got five Biome errors. The same file outside the core got none, and the core as it stands passes.
- **Fuzzing.** About 15,000 random Diagrams, in both directions, kept the clearance, the grid and the rank rule. Fuzzing found one bug: packing took a block that two others waited for to be a cycle, and threw. Its smallest case, two crossing calls beside an unconnected Node, joined the property fixtures.
- **Speed.** Random Diagrams of 60 Nodes and 150 Edges render in about 10 ms, and of 300 Nodes and 750 Edges in about 85 ms.
- **Not covered by any ticket.** Layout step 6 says that each gap between two ranks leaves room for the labels and lanes of the Edges that span it. Ticket 10 covers the labels, but no ticket covers the lanes. Until one does, the gap is a fixed 96 px.
- **Until ticket 03.** The minimal route bends once, turning horizontally first. So in a `down` Diagram, an Edge that bends first runs along its source's bottom side.
- **Merging with ticket 03.** Both tickets place the header Ports by direction. Ticket 03's grid needs the clearance that layout keeps, which the scene now carries as `clearance`.

Merged into diagram-engine in d8d3d69.
