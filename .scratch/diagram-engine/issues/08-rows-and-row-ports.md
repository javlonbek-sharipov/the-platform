# 08: Rows and Row Ports

**What to build:** Nodes can show Rows, and Edges can attach to them.

- A Row is a name and a value, such as `replicas: 3`, shown below the Node's header.
- An Edge can attach to one particular Row.
- Naming a Row that doesn't exist is a type error in the editor, and a validation error in generated JSON.

**Blocked by:**

- 03 Edges routed around Nodes
- 04 Text that fits everywhere

**Status:** ready-for-agent

**Spec:**

- [The JSON model](../spec.md#the-json-model): Row, Edge ends
- [The authoring API](../spec.md#the-authoring-api)
- [Layout](../spec.md#layout): step 1
- [Ports](../spec.md#ports)

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Showing Rows**

- [ ] Nodes accept Rows. Each Row adds a band to its Node's height, with the name on the left and the value on the right.
- [ ] When a Row is too long, its name is shortened before its value, and lint warns.

**Attaching Edges**

- [ ] Every Row has a Port on each side of its Node, whatever the direction.
- [ ] An Edge end that names a Row leaves or enters at that Row's Port on the matching side.

**Missing Rows**

- [ ] A Node handle carries its Row names, so naming a missing Row on an Edge end is a type error (a type test).
- [ ] Generated JSON that names a missing Row is a validation error.

**Checks**

- [ ] Seam 1: an Edge attached to a Row starts or ends level with that Row.
- [ ] Every routing property from ticket 03 still holds.
- [ ] The example Diagram gives a few Nodes Rows, and attaches one Edge to a Row.
