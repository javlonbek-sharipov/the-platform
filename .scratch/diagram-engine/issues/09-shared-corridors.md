# 09: Shared corridors

**What to build:** busy Diagrams stay readable.

- Edges of the same Kind that go into the same Port merge into one trunk.
- Edges that share a corridor spread into separate lanes, and don't cross each other without need.
- When a corridor is overfull, the Edges through it are routed again until they fit.
- Parallel Edges, two Edges joining the same pair of Ports, stay visibly apart along their whole length, and must be given ids.
- A crowded fixture keeps routing fast.

**Blocked by:**

- 03 Edges routed around Nodes
- 06 Groups

**Status:** ready-for-agent

**Spec:**

- [Edge routing](../spec.md#edge-routing): steps 2, 4, 5, 6 and 7 (offsetting runs by lane, and the jog)
- [Layout](../spec.md#layout): step 6, the gap between ranks
- [The JSON model](../spec.md#the-json-model): Rules › Ids
- [Seam 1](../spec.md#seam-1-the-core-in-memory): Speed

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Capacity**

- [x] Each open segment's capacity is its free width divided by the lane spacing.
- [x] Each gap between two ranks leaves room for the lanes of the Edges that span it. Ticket 02 left the gap a fixed width; ticket 10 adds room for labels.

**Bundling**

- [x] Edges bundle by target Port and Edge Kind. The bundle key is a parameter.
- [x] A later Edge of a bundle may end its search where it joins the trunk from the side.
- [x] A trunk segment counts only once against capacity.

**Negotiation**

- [x] Each over-capacity segment gets a lasting history cost, and everything is routed again.
- [x] There are a few passes at most, stopping early once no segment is over capacity.
- [x] Edges are routed in a stable order: by bundle key, then by Edge id.

**Nudging**

- [x] Each overlap set is sorted so that its lanes don't cross, then spaced around its line.
- [x] In a narrow corridor, the spacing shrinks to a minimum, and every lane stays inside the corridor with some padding.
- [x] Each run of a polyline is offset by its lane. Where a Port's stub meets a lane at a different height, a short jog joins them.

**Parallel Edges**

- [x] Parallel Edges never share a trunk, or any stretch of lane.
- [x] If two Edges would get the same default id, validation fails and asks for explicit ids.

**Checks**

- [x] The Seam 1 properties hold:
  - two Edges in different bundles never share a stretch of lane;
  - parallel Edges stay apart from end to end;
  - every earlier routing property still holds.
- [x] The crowded fixture has about 60 Nodes and 150 Edges, a wide fan-out squeezed through one corridor, and several nested Groups.
- [x] In the test suite, the crowded fixture lays out and routes in less than a generous time limit. A separate benchmark reports the real time.
- [x] A golden file covers the crowded fixture.

## Comments

- Orchestrator: added the rank-gap checkbox under **Capacity**. Ticket 02 found that no ticket covered the lanes half of Layout step 6 ("Each gap between two ranks leaves room for the labels and lanes of the Edges that span it"); ticket 10 covers the labels half.
- Orchestrator: added the lane offset and jog checkbox under **Nudging**. Ticket 03 left the jog unticked, because nothing is offset into lanes before this ticket (see ticket 03's Comments).
- Orchestrator: ticket 08's Comments end with a note for this ticket ("For ticket 09"). Read it before you start.

**Implementation, 5 November 2026** (branch `t3/89f26616`). Choices the spec left open are recorded in its "Decisions made during implementation", under Ticket 09.

- **Manual check, by eye.** I rendered the fixtures with the bundled font through resvg and looked at them at 2× to 5×:
  - On every-kind, the Shop API's fan-out leaves one stub and splits into nested lanes that don't cross.
  - On the gateway fixture in all three bundlings:
    - by target, three calls merge into one trunk into the gateway, and the partner's message keeps a lane of its own, jogging onto the stub's line just before the Port;
    - by source, the gateway's calls share a trunk out of its Port;
    - with no bundling, four lanes converge on the Port through nested jogs.
  - On the fan-out out of a Group, twelve lanes spread from one Port in nested jogs and turn in the gap below the Group, not along its padding.
  - In a sample Atlas, two parallel Edges run apart: one straight, the other in a lane 8 px below, jogging at both stubs' ends.
  - The crowded fixture is busy but legible, with no lane on top of another.
- **Manual check, lint.** In a sample Atlas, a module declared two Edges between the same two Nodes and left one with the default id. `lint` reported a `default-edge-id` error at `docs/payments.diagram.ts:6:4`, the `d.edge(` call, naming the other Edge, and exited with 1. After I gave it an id, `render` wrote the SVG and lint passed.
- **What the properties found.** Running the Seam 1 properties on the crowded fixture led to most of the decisions below:
  - a Port's junction became a fixed stretch;
  - lanes became shared tracks, and lines too close for their lanes are placed together;
  - other Ports' stubs became soft limits;
  - most importantly, nudging feeds back into negotiation. The grid's capacity can't see one-sided limits, so a set that nudging has to squeeze below the minimum spacing now counts as over capacity, and its Edges are routed again. Both directions of the crowded fixture end with nothing over capacity, after three passes (`right`) and four (`down`).
- **Stubs can be shortened.** Ticket 03's test that every route passes its stub's end is now: every route leaves along its stub for at least the lane padding, 8 px. A route that turns off at a stub's end may cut into it, so that a set of lanes can use both halves of a narrow corridor. Other Ports' lanes still keep out of a stub.
- **The jog** that ticket 03 left unticked is built: a first or last run that carries a stub straight on into a lane at another height jogs at or past the stub's end.
- **Speed.**
  - `pnpm bench` (plain Node, `packages/diagrams/scripts/benchmark.ts`): the crowded fixture takes 86 ms median drawn `right` and 132 ms drawn `down`. The suite's limit is 3 s.
  - A random 300-Node, 748-Edge Diagram takes 7.2 s in two passes, against about 3 s in ticket 03, nearly all of it in A*. Negotiation's costs weaken the Manhattan estimate, and the gaps between ranks are wider. Moving the search's vertex coordinates and queue into typed arrays brought it down from 10 s without changing any route.
- **For ticket 10.** Labels go on a run that belongs to one Edge alone. Lane groups come from `laneGroups` in `src/core/bundles.ts`, and a trunk is where routes of one group share a stretch. `gapsOf` in `src/core/layers.ts` is where the gap between ranks gets its room for labels too.
