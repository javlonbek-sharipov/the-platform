# 06: Groups

**What to build:** authors can group Nodes on a Diagram.

- Authors nest Nodes inside `system`, `region` and `zone` Groups, and Groups inside other Groups, by declaring members inside them.
- Layout works one level at a time. Each Group's members are laid out together, inside a box with padding and a label band.
- Routes avoid Group labels. An Edge between two Nodes of the same Group stays inside that Group when it can.
- Groups can carry a description and Links.
- One id can be a Node on one Diagram and a Group on another.

**Blocked by:**

- 02 Automatic layout
- 03 Edges routed around Nodes

**Status:** ready-for-agent

**Spec:**

- [The JSON model](../spec.md#the-json-model): Group, nesting
- [The authoring API](../spec.md#the-authoring-api)
- [Notations › Architecture](../spec.md#architecture): Groups
- [Layout](../spec.md#layout): steps 3 and 7
- [Edge routing](../spec.md#edge-routing): steps 1 and 3

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Model and validation**

- [ ] A Group declaration takes a callback in which its members are declared. That way, each Node gets exactly one Group by construction.
- [ ] The model's `members` lists keep declaration order.
- [ ] Generated JSON is a validation error if it puts a Node or Group in two parents, in no parent, or in a cycle of Groups.
- [ ] Group Kinds are limited to `system`, `region` and `zone`.

**Layout**

- [ ] Layout goes from the inside out:
  - each level lays out its own children;
  - a child Group counts as one block of its size;
  - an Edge between Nodes inside two different children connects those children at that level;
  - Edges that leave the level are ignored at that level.
- [ ] A Group's box is its children's bounds plus padding and a label band that holds its title. The padding is more than half the clearance.

**Routing**

- [ ] Label bands are obstacles, with grid lines around them.
- [ ] Crossing a Group's border adds a small cost.
- [ ] No route runs along a Group's border.

**Atlas**

- [ ] Groups accept a description and Links. Lint resolves a Group's Links the same way as a Node's.
- [ ] Across the Atlas, one id may be a `system` Node on one Diagram and a `system` Group on another. If the same id is a `system` in one place and a `region` in another, lint reports a Kind conflict.

**Checks**

- [ ] The Seam 1 properties hold:
  - every Group contains its members with padding, and sits inside its parent;
  - no route passes through a Group label;
  - on a fixture where a shortcut outside the Group exists, an Edge between two Nodes of one Group stays inside it.
- [ ] The example Diagram gains a `region` with a `zone` inside it.
