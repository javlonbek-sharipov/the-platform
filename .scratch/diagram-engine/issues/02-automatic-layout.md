# 02: Automatic layout

**What to build:** Diagrams lay themselves out readably, without any coordinates in the source.

- Nodes fall into ranks along the Diagram's direction.
- Edge crossings are reduced.
- Declaration order settles every tie, so a small edit to the source moves things only a little.
- Authors can choose `down` instead of the default `right`.

**Blocked by:** 01 A Diagram from source to committed SVG.

**Status:** ready-for-agent

**Spec:**

- [Layout](../spec.md#layout). Groups come in ticket 06.
- [Ports](../spec.md#ports)
- [Seam 1](../spec.md#seam-1-the-core-in-memory)

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Ranks**

- [ ] Cycles are found by a depth-first search that starts from the Nodes in declaration order. An Edge that leads back into the current search path is left out of ranking, but is still drawn.
- [ ] Each Node's rank is the length of the longest path that reaches it. Self-loops are ignored, and parallel Edges count once.
- [ ] An Edge that spans several ranks gets a placeholder in each rank it passes.

**Order within ranks**

- [ ] Crossings are reduced with a fixed number of forward and backward sweeps:
  - each sweep sorts each rank by the average position of its neighbors in the rank before it;
  - ties keep the current order;
  - the order with the fewest crossings wins, and on a tie the earlier one does.

**Coordinates**

- [ ] Ranks become columns for `right` and rows for `down`.
- [ ] Within a rank, members are:
  - centered on the rank's line;
  - at least the clearance apart;
  - aligned with the Nodes they connect to, where that keeps both the order and the clearance;
  - snapped to a small grid.
- [ ] With `down`, input Ports sit on top and output Ports at the bottom.

**Checks**

- [ ] The Seam 1 properties hold, in both directions, on fixtures for: a chain, a fan-out, a fan-in, a diamond, a cycle, and two disconnected parts. The properties are:
  - no two Nodes overlap or enter each other's clearance;
  - every Edge's target ranks after its source, except for Edges that close a cycle.
- [ ] Declaring two unconnected Nodes of one rank in the opposite order swaps their positions within that rank.
- [ ] A fixture whose declaration order alone would produce crossings is laid out with fewer crossings.
- [ ] Layout uses only the arithmetic the spec allows: addition, subtraction, multiplication, division, square root, rounding, min and max.
- [ ] The example Diagram is rendered again with the new layout.
