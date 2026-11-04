# 11: Edges show what they carry, and SVGs describe themselves

**What to build:** readers can tell kinds of communication apart, and see each Edge's direction at a glance.

- `call` Edges are solid and `message` Edges are dashed. Both get arrowheads, direction chevrons and a darker casing.
- A small junction mark sits where one Port splits into several Edges.
- An Edge that crosses between different `region` or `zone` Groups gets a warning color and a badge at its midpoint.
- Each SVG also describes itself to screen readers.

**Blocked by:**

- 07 Architecture Nodes look like what they are
- 09 Shared corridors

**Status:** ready-for-agent

**Spec:**

- [Notations](../spec.md#notations): sentence forms
- [Notations › Architecture](../spec.md#architecture): Edges
- [Static SVG](../spec.md#static-svg): Look, Accessibility

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Edge styles**

- [ ] `call` and `message` Edges look different in both themes.
- [ ] Every Edge has an arrowhead at its target, and chevrons at a fixed spacing along its route.
- [ ] Every Edge is drawn as a body inside a darker casing.
- [ ] Wherever one Port feeds two or more Edges, a junction mark sits over the split.
- [ ] An Edge whose ends sit in different `region` Groups, or in different `zone` Groups, gets the warning color and a badge at its midpoint.

**Accessibility**

- [ ] Each Edge Kind declares a sentence form in its Notation, such as "Checkout API calls Payments API".
- [ ] The SVG's root has:
  - `role="img"`;
  - a `<title>` that holds the Diagram's title;
  - a `<desc>` that lists its Nodes, and its Edges in their sentence forms.

**Checks**

- [ ] Golden files cover both Edge Kinds, a junction, and a cross-region Edge.
- [ ] The example Diagram shows each of those.
