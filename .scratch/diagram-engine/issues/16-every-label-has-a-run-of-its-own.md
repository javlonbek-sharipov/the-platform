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

- [x] A labeled Edge joins its bundle's trunk only where the trunk leaves it a straight run of its own that holds its label. Otherwise it keeps its own lane from end to end.
- [x] Unlabeled Edges, and labeled Edges that keep such a run, bundle as before.

**Checks**

- [x] With every Edge of the crowded fixture labeled, in both directions, no label falls back because a trunk took its run, and the fixture stays inside its time limit.
- [x] The two-regions fixture places every label on a run of its own, with no `label-placement` warning.
- [x] A label that still falls back gets a warning that says why, for example that it is too long for any run.
- [x] The Seam 1 label and routing properties still hold. Golden files change only through the update command.

## Comments

- Orchestrator: added after ticket 10. Its label properties found labels with no run of their own, and the spec's rule then gave a warning the author can't fix. The agent skill in ticket 15 has agents fix whatever lint reports, so ticket 15 now waits on this ticket.

**Implementation, 5 November 2026** (branch `t3/diagram-label-runs`). Choices the spec left open are recorded in its "Decisions made during implementation", under Ticket 16.

- **Manual check, by eye.** I rendered labeled fixtures through resvg, as `diagrams export` does, at 1× to 3×, beside the same Diagrams drawn by diagram-engine at 1e8a925:
  - The web app and the admin app both call the gateway, and only the web app's Edge is labeled. Its Edge now runs straight in a lane of its own with "Signs in" beside it, and the admin app's keeps a lane 8 px away, jogging into the gateway's stub. Before, the two shared one line, and the label sat at its middle, where it could name either Edge.
  - In two regions, the US API's Edge runs straight into the US database with "Syncs stock" above it, and the EU API's Edge, colored for crossing regions, keeps its own lane up to the database's stub. Before, it joined right after the US API's stub, and the US API's label sat at the middle of the line they shared.
  - In the crowded fixture with every Edge labeled and drawn `right`, five lanes run into Tracing from the left and meet at its Port's junction, where diagram-engine drew one trunk: the labeled Edges crowded out of it keep lanes of their own. Logs looks the same. It's busy, as every Edge labeled is. The labels that still fall back are mostly where other labels leave no room, as at the clients' corner. Drawn `down`, one is too long for any run: the Shipping API's six Edges fork along its stub's line and take the top of its straight run to the Picker, leaving 32 px for a two-line label 34 px tall. Its warning says so, and without its Technology it would fit.
- **Manual check, lint.** The CLI test now runs lint on three parallel labeled Edges. The middle one's label has no room beside its run, and lint warns at its `d.edge(` line, saying why.
- **What the properties found.**
  - With every Edge of the crowded fixture labeled, 8 labels fall back drawn `right` and 9 drawn `down`, from 44 and 36. All lack room but one, drawn `down`, which is too long for any run. With every sixth Edge labeled, 1 falls back each way, from 5. Two regions has none, from one each way.
  - The label properties now run on the crowded fixture with every Edge labeled, and on a fan-in whose labels show PostgreSQL's logo. On the former, some placed labels lie under labels drawn at their routes' midpoints, which ticket 10's decision 3 allows, so the clearance property now leaves those out. diagram-engine has 7 such overlaps there drawn `right` and 8 drawn `down`; this branch has 7 and 3.
  - Run on labeled copies of the routing fixtures, which I didn't commit, every routing property holds but one. Drawn `down` with every Edge labeled, one corridor a clearance wide, between two Nodes of a rank, holds five lanes of the Orders API's fan-out 4 px apart, one more than its width holds at the preferred spacing. The fifth, `orders-api->tracing`, now keeps a lane of its own instead of riding the trunk into Tracing. The router sees nothing over capacity: the lanes come from two grid lines, whose shared width the grid's capacity can't see (ticket 09, decision 5), and five fit at the minimum spacing. diagram-engine passes that property there.
- **Speed.** `pnpm bench` now times the crowded fixture with every Edge labeled too. See decision 4.
- **Merging diagram-engine, with tickets 11, 12 and 14.** `render` marks the Edges once the last round is routed. Ticket 14 reads every module in `test/fixtures/` as Diagrams, so the helper that labels a Diagram's Edges moved to `test/support/labeled.ts`. The label tests measure a Technology with a logo by its name after the logo, as ticket 12 draws it.
- **For ticket 15.** A `label-placement` warning now says why the label is at its route's midpoint. "Too long for any run" asks for a shorter label, or one without its Technology and rate. "No room beside any run" means other labels, Nodes or stubs take every place, so shortening labels near it may help. "No run of its own" now shows mostly with a `fallback-route` warning on the same Edge, so fix that first.
