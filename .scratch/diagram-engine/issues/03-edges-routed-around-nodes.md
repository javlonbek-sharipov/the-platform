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

- [ ] Every Port has a short, straight stub.
- [ ] The header Ports sit on the sides that the direction gives.

**Grid**

- [ ] The router builds a sparse orthogonal grid. Its lines run:
  - half a clearance outside each side of each Node;
  - through the end of each Port stub;
  - one more on each side, outside the whole drawing.
- [ ] Grid vertices lie only outside Nodes.
- [ ] A segment is open only if it doesn't pass through a Node.

**Search**

- [ ] Each Edge is routed by A\* over pairs of (vertex, direction of travel), from the end of one stub to the end of the other.
  - A step's cost is its length plus a fixed cost for each bend.
  - U-turns aren't allowed.
  - The heuristic is the Manhattan distance.
- [ ] Edges are routed in a stable order.

**Drawing the route**

- [ ] Each route becomes a polyline. Consecutive steps in the same direction are merged, and a short jog is added where a stub meets a run at a different height.
- [ ] Every corner is rounded with an arc. The arc's radius is at most half the length of either run that meets at the corner.
- [ ] The SVG draws corners with arc commands.

**Fallback**

- [ ] When the search fails, or goes over its budget, the Edge gets the spec's fallback route and lint warns.
- [ ] A test exercises this by setting a tiny search budget through the core's options.

**Scene**

- [ ] The scene records each Edge's Ports and route, and whether the Edge fell back.

**Checks**

- [ ] The Seam 1 properties hold on fixtures that include a self-loop, an Edge that runs against the direction, and a Node standing between two Nodes that are connected to each other. The properties are:
  - every segment is horizontal or vertical;
  - no route passes through a Node;
  - every Edge gets a route;
  - no corner's radius is more than half of a run that meets there.
- [ ] Geometry uses only the arithmetic the spec allows.
- [ ] The example Diagram is rendered again with orthogonal routes.
