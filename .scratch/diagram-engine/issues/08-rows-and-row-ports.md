# 08: Rows and Row Ports

**What to build:** Nodes can show Rows, and Edges can attach to them.

- A Row is a name and a value, such as `replicas: 3`, shown below the Node's header.
- An Edge can attach to one particular Row.
- Naming a Row that doesn't exist is a type error in the editor, and a validation error in generated JSON.

**Blocked by:**

- 03 Edges routed around Nodes
- 04 Text that fits everywhere

**Status:** resolved

**Spec:**

- [The JSON model](../spec.md#the-json-model): Row, Edge ends
- [The authoring API](../spec.md#the-authoring-api)
- [Layout](../spec.md#layout): step 1
- [Ports](../spec.md#ports)

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Showing Rows**

- [x] Nodes accept Rows. Each Row adds a band to its Node's height, with the name on the left and the value on the right.
- [x] When a Row is too long, its name is shortened before its value, and lint warns.

**Attaching Edges**

- [x] Every Row has a Port on each side of its Node, whatever the direction.
- [x] An Edge end that names a Row leaves or enters at that Row's Port on the matching side.

**Missing Rows**

- [x] A Node handle carries its Row names, so naming a missing Row on an Edge end is a type error (a type test).
- [x] Generated JSON that names a missing Row is a validation error.

**Checks**

- [x] Seam 1: an Edge attached to a Row starts or ends level with that Row.
- [x] Every routing property from ticket 03 still holds.
- [x] The example Diagram gives a few Nodes Rows, and attaches one Edge to a Row.

## Comments

**Implementation, 4 November 2026** (branch `t3/diagram-row-ports`). Choices the spec left open are recorded in its "Decisions made during implementation", under Ticket 08.

- **Manual check, by eye.** I rendered the example Diagram and three fixtures with the bundled font, and looked at them in headless Chrome at 2×. Each Row sits in its own band below a line under the header, with its name on the left and its value right-aligned. Every Edge attached to a Row leaves or enters level with the Row's text: on the right side when it starts there and on the left when it ends there, in both directions. A self-loop from one Row to another goes around its Node. Shortened Rows read `maximum conn…  4000` and `r…  eu-west-1, eu-ce…`.
- **Manual check, lint.** In a sample Atlas, a Row too long for its Node printed a `text-shortened` warning at the `d.node(` line and column. A module that default-exports generated JSON naming a missing Row failed with an `edge-end` error that lists the Node's Rows, and `lint` exited with 1.
- **Manual check, the editor.** Naming a missing Row gives `Argument of type '"order"' is not assignable to parameter of type '"orders" | "stock"'`, so the error lists the Rows the Node has. A Node with no Rows gives `parameter of type 'never'`.
- **The example's SVG** now embeds two subsets, one per weight: 4.9 KB of base64 for the Rows' regular weight and 5.4 KB for the titles. The whole SVG is 14.7 KB.
- **Not done: lining Nodes up by their Row Ports.** Layout still aligns Nodes by their header Ports, so an Edge attached to a Row usually jogs once, as the example's `order-placed` Edge does. Brandes and Köpf could align on the Ports each Edge uses instead, with each block's vertices offset by their Ports. That's beyond this ticket's layout step, so I left it for a later layout ticket.
- **Speed.** Every Row Port adds a line to the routing grid, used or not, as the spec says. At 60 Nodes with 4 Rows each and 150 Edges, rendering takes 54 to 62 ms, against 41 ms without Rows. At 300 Nodes with 4 Rows each and 750 Edges, half of whose ends name Rows, it takes 8.6 s, against 3.8 s without Rows. Leaving out the lines of Row Ports that no Edge uses brought that down only to 6.7 s, so I kept the spec's grid.
- **For ticket 07.** `writeNode` in `svg.ts` now also draws the divider line (in the `line` color) and the Row texts (in `ink`). Both literals need the same `--diagram-` treatment as the rest. A Kind's width must stay a multiple of 16 px. Row bands span the Node's full width, so an outline that isn't a rectangle needs to leave room for them.
- **For ticket 09.** A Row's two Ports are Ports of their own, so a bundle that goes to one Port must tell a Row's input Port from its Node's. Routes still overlap where they share a grid line, as before.
- **For ticket 14.** An Edge end is a Node id or `{ node, row }`, both strings. A Row is `{ name, value? }`, both strings, and Row names are unique within a Node (`duplicate-row`).

Merged into diagram-engine in 5b272b6.
