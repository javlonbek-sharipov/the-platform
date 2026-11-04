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

**Status:** resolved

**Spec:**

- [The JSON model](../spec.md#the-json-model): Group, nesting
- [The authoring API](../spec.md#the-authoring-api)
- [Notations › Architecture](../spec.md#architecture): Groups
- [Layout](../spec.md#layout): steps 3 and 7
- [Edge routing](../spec.md#edge-routing): steps 1 and 3

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Model and validation**

- [x] A Group declaration takes a callback in which its members are declared. That way, each Node gets exactly one Group by construction.
- [x] The model's `members` lists keep declaration order.
- [x] Generated JSON is a validation error if it puts a Node or Group in two parents, in no parent, or in a cycle of Groups.
- [x] Group Kinds are limited to `system`, `region` and `zone`.

**Layout**

- [x] Layout goes from the inside out:
  - each level lays out its own children;
  - a child Group counts as one block of its size;
  - an Edge between Nodes inside two different children connects those children at that level;
  - Edges that leave the level are ignored at that level.
- [x] A Group's box is its children's bounds plus padding and a label band that holds its title. The padding is more than half the clearance.

**Routing**

- [x] Label bands are obstacles, with grid lines around them.
- [x] Crossing a Group's border adds a small cost.
- [x] No route runs along a Group's border.

**Atlas**

- [x] Groups accept a description and Links. Lint resolves a Group's Links the same way as a Node's.
- [x] Across the Atlas, one id may be a `system` Node on one Diagram and a `system` Group on another. If the same id is a `system` in one place and a `region` in another, lint reports a Kind conflict.

**Checks**

- [ ] The Seam 1 properties hold:
  - every Group contains its members with padding, and sits inside its parent;
  - no route passes through a Group label;
  - on a fixture where a shortcut outside the Group exists, an Edge between two Nodes of one Group stays inside it.
- [x] The example Diagram gains a `region` with a `zone` inside it.

## Comments

**Implementation, 4 and 5 November 2026** (branch `t3/de575a52`). Choices the spec left open are recorded in its "Decisions made during implementation", under Ticket 06.

- **Unticked: the shortcut fixture.** The first two Seam 1 properties hold. The third holds on every fixture: a routing property checks that each Edge stays inside every Group that holds both its ends. But no fixture can offer a real shortcut outside a Group, so I couldn't write the fixture the checkbox asks for.
  - With a padding of one clearance, the grid lines half a clearance outside a Group's members run down the middle of its padding. The lines around nested Groups' boxes close that ring. So every way around a Group's members outside it has a shorter way around them inside it.
  - With the crossing cost set to 0, fuzzing found no route that left its Group in 4,500 random Diagrams with nested Groups. None of 2,000 left after the merge with tickets 07 and 08 either, with every Kind, Rows, callouts and Edges ending at Rows.
  - The closest test gives the route open space just outside its Group: `a Group's border › keeps an Edge between two of its Nodes inside it, though open space lies just outside it`.
  - What the cost does change has its own test, which fails at cost 0: an Edge turns beside a Group it only passes, where at cost 0 it cut through the Group's padding.
  - So the checkbox can be ticked on the strength of the property, or reworded.
- **A narrower reading: label bands as obstacles.** The obstacle is the label box, the part of the band that the title fills. A whole band would close a Group's top to Edges from above, where most Edges come from on a `down` Diagram. Routes keep half a clearance from the label box, and a test checks it on a Group whose label lies in an Edge's way (decision 5).
- **Manual check, by eye.** I rendered the example Diagram and every Group fixture in headless Chrome at 2×, in both themes, and looked at them.
  - Every Group holds its members, with its title at the top left. A `system` is drawn heavier than a `region`, and a `zone` is dashed. Nested Groups and an empty one look right.
  - Callout tags sit inside their Groups, clear of the labels, and Edges that end at Rows cross into Groups.
  - Edges leave Groups at right angles, never run along a border, and go around a label in their way.
  - With the padding at 24 px, a back Edge inside a Group ran 8 px from its border. At one clearance, it runs down the middle of the padding, so I kept that.
- **Manual check, lint.** In the repo, a probe Diagram drew `eu-west` as a `zone` Group and `eu-west-a` as a `system` Node. Lint reported each Kind conflict at both places, down to the nested `region.group(` call on line 25, column 10 of the example. A Group's Link to `eu-west-a`, drawn only as a Group, resolved, and its Link to `eu-centrl` was reported as broken.
- **Fuzzing.** Up to 28 Nodes and 9 nested Groups per Diagram, in both directions:
  - Before the merge, the first 3,000 Diagrams held 14 routes that ran along a Group's border, each on a grid line that came level with the border from elsewhere. That led to closing every segment along a border (decision 6). Then 4,500 Diagrams held none.
  - 2,000 after the merge found no problem. Every member, tags included, was inside its Group with padding, and no Node was within a clearance of a label. No route touched a label or a tag, ran along a border, left its Group, or fell back.
- **Speed.** Random Diagrams of 60 Nodes and 150 Edges take about 44 ms with 8 nested Groups, against 34 ms without. At 300 Nodes and 750 Edges, about 3.3 s with 30 Groups, against 3.9 s without.
- **Merged with tickets 07 and 08.**
  - Each Node's block in a level now holds its Kind's size, its Rows, and the room for its callout's tag. The tag's room counts across the rank for `right`, and as the `lead` along it for `down`.
  - The grid has lines around tags and Row Ports' stubs as well as Groups.
  - Groups take their colors from the theme: their boxes in `--diagram-border` and their titles in `--diagram-muted`. Ticket 07's color tests pass on the example, Groups included.
  - Group titles join `textDiagnostics`. The example keeps its shopper, External payment provider, statuses and Rows, inside a region and a zone.
- **For later tickets.**
  - Ticket 09: `test/fixtures/groups.ts` has nested Groups for the crowded fixture. Between a Group's members and its border there's a corridor one clearance wide, as between two Nodes. A segment's `crossEast` and `crossSouth` count its Group crossings.
  - Ticket 10: labels must stay clear of each Group's `label` box in the scene.
  - Ticket 11: the Groups that hold an Edge's ends come from the model's `members`. A scene Group's `depth` gives its nesting.
  - Ticket 14: the schema needs Groups' `members`, `description` and `links`. Nesting can't be checked by a schema, so it belongs in the schema's description.
  - The web component: each Group's `<g>` carries `data-group` and `data-kind`, for details and drill-down.

Merged into diagram-engine in e2df131.
