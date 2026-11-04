# 16: Every label has a run of its own

**What to build:** each Edge label sits on a stretch of route that belongs to its Edge alone, so readers can tell which Edge it names, and authors get no warning they can't act on.

- Today a bundle's trunk can take all of an Edge's route past its stub. Its label then falls back to the route's midpoint, with a `label-placement` warning that the author can't fix. With every Edge of the crowded fixture labeled, 44 of 148 labels fall back drawn `right`, and 36 drawn `down`.
- Instead, a labeled Edge that the trunk would leave without a run that holds its label stays out of the trunk, in its own lane, as a parallel Edge does.

**Blocked by:**

- 10 Edge labels, rates and hops

**Status:** ready-for-agent

**Spec:**

- [Edge routing](../spec.md#edge-routing): step 4, Bundling, and step 8, Labels
- Ticket 10's Comments, on what the label properties found

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Routing**

- [ ] A labeled Edge joins its bundle's trunk only where the trunk leaves it a straight run of its own that holds its label. Otherwise it keeps its own lane from end to end.
- [ ] Unlabeled Edges, and labeled Edges that keep such a run, bundle as before.

**Checks**

- [ ] With every Edge of the crowded fixture labeled, in both directions, no label falls back because a trunk took its run, and the fixture stays inside its time limit.
- [ ] The two-regions fixture places every label on a run of its own, with no `label-placement` warning.
- [ ] A label that still falls back gets a warning that says why, for example that it is too long for any run.
- [ ] The Seam 1 label and routing properties still hold. Golden files change only through the update command.

## Comments

- Orchestrator: added after ticket 10. Its label properties found labels with no run of their own, and the spec's rule then gave a warning the author can't fix. The agent skill in ticket 15 has agents fix whatever lint reports, so ticket 15 now waits on this ticket.
