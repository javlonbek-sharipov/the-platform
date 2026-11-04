# 03: Edges routed around Nodes

**What to build:** every Edge is drawn as horizontal and vertical runs joined by rounded corners.

- It leaves and enters its Nodes at right angles to their sides.
- It never passes through a Node.
- Self-loops go around their own Node.
- Edges that run against the direction go around the Nodes in their way.
- If the search can't route an Edge, the Edge still gets a simple route, and lint warns about it.

**Blocked by:** 01 A Diagram from source to committed SVG.

**Status:** ready-for-agent

**Spec:**

- [Ports](../spec.md#ports)
- [Edge routing](../spec.md#edge-routing), steps 1, 3, 7, 10 and 11
- [The scene](../spec.md#the-scene)
- [Seam 1](../spec.md#seam-1-the-core-in-memory)

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Ports**

- [x] Every Port has a short, straight stub.
- [x] The header Ports sit on the sides that the direction gives.

**Grid**

- [x] The router builds a sparse orthogonal grid. Its lines run:
  - half a clearance outside each side of each Node;
  - through the end of each Port stub;
  - one more on each side, outside the whole drawing.
- [x] Grid vertices lie only outside Nodes.
- [x] A segment is open only if it doesn't pass through a Node.

**Search**

- [x] Each Edge is routed by A\* over pairs of (vertex, direction of travel), from the end of one stub to the end of the other.
  - A step's cost is its length plus a fixed cost for each bend.
  - U-turns aren't allowed.
  - The heuristic is the Manhattan distance.
- [x] Edges are routed in a stable order.

**Drawing the route**

- [ ] Each route becomes a polyline. Consecutive steps in the same direction are merged, and a short jog is added where a stub meets a run at a different height.
- [x] Every corner is rounded with an arc. The arc's radius is at most half the length of either run that meets at the corner.
- [x] The SVG draws corners with arc commands.

**Fallback**

- [x] When the search fails, or goes over its budget, the Edge gets the spec's fallback route and lint warns.
- [x] A test exercises this by setting a tiny search budget through the core's options.

**Scene**

- [x] The scene records each Edge's Ports and route, and whether the Edge fell back.

**Checks**

- [x] The Seam 1 properties hold on fixtures that include a self-loop, an Edge that runs against the direction, and a Node standing between two Nodes that are connected to each other. The properties are:
  - every segment is horizontal or vertical;
  - no route passes through a Node;
  - every Edge gets a route;
  - no corner's radius is more than half of a run that meets there.
- [x] Geometry uses only the arithmetic the spec allows.
- [x] The example Diagram is rendered again with orthogonal routes.

## Comments

**Implementation, 4 November 2026** (branch `t3/route-edges-around-nodes`). Choices the spec left open are recorded in its "Decisions made during implementation", under Ticket 03.

- **Unticked: the jog.** Steps in the same direction merge into one run, and a test checks it. But no route in this ticket has a stub that meets a run at a different height: every stub ends on a grid line, and runs stay on their lines until ticket 09 offsets them into lanes. So the jog has nothing to act on yet. Ticket 09 should add it when it offsets runs (spec step 7).
- **Manual check, by eye.** I rasterized the example Diagram, the every-kind golden file and the test fixtures in headless Chrome, at 2× and 4×. Routes keep clear of Nodes, leave and enter at right angles, and round every corner on the inside of the turn. Self-loops and Edges against the direction go around their Nodes. The tiny-budget fallback routes match the spec's two shapes. Edges that share a grid line still overlap, as expected until ticket 09's lanes.
- **Manual check, lint.** With the default search budget set to 1, `diagrams lint` printed a `fallback-route` warning for each Edge of the example and counted them in its summary. After the merge with ticket 05, each warning points at the line and column that declares its Edge. A sample Atlas can't force a fallback: the budget is only a core option, and with the default budget every Edge of a valid Diagram finds a route.
- **Speed.** On a synthetic Diagram of 60 Nodes and 150 random Edges, rendering takes about 30 ms. At 300 Nodes and 750 Edges, it takes about 3 s, and the longest search visits about 200,000 states, in 45 ms. Ticket 02's layout spreads Nodes over many more rows than the minimal layout did, so I made the search about 4× faster without changing any route, and raised the default budget from 200,000 to 1,000,000. Ticket 09 may want a heuristic that also counts the bends a route still needs. That would cut the long detours, but the spec fixes the heuristic as the Manhattan distance.
- **The outer lines** are built, but no route needs them yet: the lines beside the outermost Nodes already pass everything. Groups (ticket 06) can make them matter.
- **Merged with ticket 02.** Its arithmetic plugin replaced the one I'd written, which allowed the same functions. Its Port tests now ignore the stub, which my tests cover. The corridor test now crosses a fan of three Nodes, which its layout packs one clearance apart. A long Edge's placeholder had moved my first corridor route out of the narrow gap.
- **For ticket 09.** The search runs backward, from the target's stub to the source's. A later Edge of a bundle can start its search anywhere on the trunk, rather than end it there.
