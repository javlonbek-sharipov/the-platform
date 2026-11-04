# 11: Edges show what they carry, and SVGs describe themselves

**What to build:** readers can tell kinds of communication apart, and see each Edge's direction at a glance.

- `call` Edges are solid and `message` Edges are dashed. Both get arrowheads, direction chevrons and a darker casing.
- A small junction mark sits where one Port splits into several Edges.
- An Edge that crosses between different `region` or `zone` Groups gets a warning color and a badge at its midpoint.
- Each SVG also describes itself: to screen readers, and by carrying its own JSON model.

**Blocked by:**

- 07 Architecture Nodes look like what they are
- 09 Shared corridors

**Status:** ready-for-agent

**Spec:**

- [Notations](../spec.md#notations): sentence forms
- [Notations › Architecture](../spec.md#architecture): Edges
- [Static SVG](../spec.md#static-svg): Look, Accessibility, Model and hooks

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Edge styles**

- [x] `call` and `message` Edges look different in both themes.
- [x] Every Edge has an arrowhead at its target, and chevrons at a fixed spacing along its route.
- [x] Every Edge is drawn as a body inside a darker casing.
- [x] Wherever one Port feeds two or more Edges, a junction mark sits over the split.
- [x] An Edge whose ends sit in different `region` Groups, or in different `zone` Groups, gets the warning color and a badge at its midpoint.

**Accessibility**

- [x] Each Edge Kind declares a sentence form in its Notation, such as "Checkout API calls Payments API".
- [x] The SVG's root has:
  - `role="img"`;
  - a `<title>` that holds the Diagram's title;
  - a `<desc>` that lists its Nodes, and its Edges in their sentence forms.

**Text baselines**

- [x] Every `<text>` sets its own `dominant-baseline`, or its own position, instead of inheriting one from a group. SVG 1.1 doesn't inherit it, so strict renderers such as resvg drew every text 5 px high. Once the SVG does this, remove PNG export's rule that patches it.
- [x] A Seam 1 test checks every `<text>` in every fixture, so text added by other tickets can't regress.

**Model**

- [x] The SVG carries its JSON model in a `<metadata>` element, so the SVG alone is enough for the web component in slice 3.
- [x] A Seam 1 test parses the metadata back and gets the model.

**Checks**

- [x] Golden files cover both Edge Kinds, a junction, and a cross-region Edge.
- [x] The example Diagram shows each of those.

## Comments

- Orchestrator: added **Model** here. Ticket 01 found that no slice 1 ticket covered the spec's `<metadata>` model (Static SVG › Model and hooks, and Testing Decisions › SVG).
- Orchestrator: added **Text baselines**. Ticket 13 found the problem; see its Comments ("For later tickets") and its decision on `dominant-baseline` in the spec.
