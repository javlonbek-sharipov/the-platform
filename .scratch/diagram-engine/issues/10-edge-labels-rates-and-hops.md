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

**Status:** ready-for-agent

**Spec:**

- [Edge routing](../spec.md#edge-routing): steps 8 and 9
- [Layout](../spec.md#layout): step 6
- [The JSON model](../spec.md#the-json-model): Edge, Rules › Values

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Edge fields**

- [ ] Edges accept `label`, `technology` and `rate`.
- [ ] Until ticket 12 adds logos, a Technology shows as its name.
- [ ] A `rate` that doesn't match the spec's format is a validation error.

**Label placement**

- [ ] Each label is centered beside the longest straight run that belongs to its Edge alone, not to a shared trunk.
- [ ] If the label would cover something there, it goes on the next-longest run.
- [ ] If no run fits, it goes at the route's midpoint, and lint warns.
- [ ] The gap between two ranks leaves room for the labels of the Edges that span it.
- [ ] A label too long for its run is shortened with an ellipsis, and lint warns.

**Hops**

- [ ] Where two Edges with different targets cross at a right angle, one of them gets a hop. A fixed rule decides which.
- [ ] The scene stores each Edge's stroke as separate pieces between hops.

**Checks**

- [ ] The Seam 1 properties hold:
  - no label overlaps a Node, a Group label or another label;
  - hops appear only where Edges with different targets cross.
- [ ] The example Diagram gets labels on a few Edges, plus one Technology and one rate.
