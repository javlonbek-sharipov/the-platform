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

- [ ] Each open segment's capacity is its free width divided by the lane spacing.
- [ ] Each gap between two ranks leaves room for the lanes of the Edges that span it. Ticket 02 left the gap a fixed width; ticket 10 adds room for labels.

**Bundling**

- [ ] Edges bundle by target Port and Edge Kind. The bundle key is a parameter.
- [ ] A later Edge of a bundle may end its search where it joins the trunk from the side.
- [ ] A trunk segment counts only once against capacity.

**Negotiation**

- [ ] Each over-capacity segment gets a lasting history cost, and everything is routed again.
- [ ] There are a few passes at most, stopping early once no segment is over capacity.
- [ ] Edges are routed in a stable order: by bundle key, then by Edge id.

**Nudging**

- [ ] Each overlap set is sorted so that its lanes don't cross, then spaced around its line.
- [ ] In a narrow corridor, the spacing shrinks to a minimum, and every lane stays inside the corridor with some padding.
- [ ] Each run of a polyline is offset by its lane. Where a Port's stub meets a lane at a different height, a short jog joins them.

**Parallel Edges**

- [ ] Parallel Edges never share a trunk, or any stretch of lane.
- [ ] If two Edges would get the same default id, validation fails and asks for explicit ids.

**Checks**

- [ ] The Seam 1 properties hold:
  - two Edges in different bundles never share a stretch of lane;
  - parallel Edges stay apart from end to end;
  - every earlier routing property still holds.
- [ ] The crowded fixture has about 60 Nodes and 150 Edges, a wide fan-out squeezed through one corridor, and several nested Groups.
- [ ] In the test suite, the crowded fixture lays out and routes in less than a generous time limit. A separate benchmark reports the real time.
- [ ] A golden file covers the crowded fixture.

## Comments

- Orchestrator: added the rank-gap checkbox under **Capacity**. Ticket 02 found that no ticket covered the lanes half of Layout step 6 ("Each gap between two ranks leaves room for the labels and lanes of the Edges that span it"); ticket 10 covers the labels half.
- Orchestrator: added the lane offset and jog checkbox under **Nudging**. Ticket 03 left the jog unticked, because nothing is offset into lanes before this ticket (see ticket 03's Comments).
- Orchestrator: ticket 08's Comments end with a note for this ticket ("For ticket 09"). Read it before you start.
