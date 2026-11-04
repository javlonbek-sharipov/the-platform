# 07: Architecture Nodes look like what they are

**What to build:** readers can tell what each Node is before they read its title.

- Each of the 12 architecture Kinds gets its own outline, badge and hue.
- External Nodes get a dashed outline.
- A status shows as a mark that changes both shape and color.
- A callout draws attention to a Node with a short tag.
- All colors come from `--diagram-` CSS custom properties, with light and dark fallbacks. An SVG then follows the viewer's theme, and a page can restyle it.

**Blocked by:** 04 Text that fits everywhere.

**Status:** ready-for-agent

**Spec:**

- [Notations › Architecture](../spec.md#architecture): Nodes
- [Static SVG](../spec.md#static-svg): Look, Theme
- [The JSON model](../spec.md#the-json-model): Node

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Kinds**

- [ ] Each Kind's outline or badge differs from every other Kind's, and still does in grayscale. For example:
  - a person is a figure;
  - a database is a cylinder;
  - a queue is a pipe;
  - a `system` looks heavier than a `service`.
- [ ] Every outline is drawn inside its Node's rectangle.
- [ ] The Notation sets each Kind's width.
- [ ] The header leaves room for the badge. A title that would touch the badge is shortened first.

**External, status and callout**

- [ ] `external` draws a dashed outline.
- [ ] `status` takes one of `ok`, `degraded`, `down` or `unknown`. Each status has a mark of its own shape and color. Any other value is both a type error and a validation error.
- [ ] `callout` draws a highlighted outline and a short tag above its Node. Layout leaves room for the tag.

**Colors**

- [ ] Every color is a `--diagram-` custom property with a fallback value.
- [ ] A `prefers-color-scheme: dark` rule repeats those uses with dark fallback values.
- [ ] A test finds no literal color anywhere else in the SVG.
- [ ] Text has a contrast ratio of at least 4.5:1 against its fill, in both themes.

**Checks**

- [ ] Golden files cover every Kind, an External Node, every status, and a callout.
- [ ] The example Diagram uses several Kinds, one External Node and one status.
