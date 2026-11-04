# 07: Architecture Nodes look like what they are

**What to build:** readers can tell what each Node is before they read its title.

- Each of the 12 architecture Kinds gets its own outline, badge and hue.
- External Nodes get a dashed outline.
- A status shows as a mark that changes both shape and color.
- A callout draws attention to a Node with a short tag.
- All colors come from `--diagram-` CSS custom properties, with light and dark fallbacks. An SVG then follows the viewer's theme, and a page can restyle it.

**Blocked by:** 04 Text that fits everywhere.

**Status:** resolved

**Spec:**

- [Notations › Architecture](../spec.md#architecture): Nodes
- [Static SVG](../spec.md#static-svg): Look, Theme
- [The JSON model](../spec.md#the-json-model): Node

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Kinds**

- [x] Each Kind's outline or badge differs from every other Kind's, and still does in grayscale. For example:
  - a person is a figure;
  - a database is a cylinder;
  - a queue is a pipe;
  - a `system` looks heavier than a `service`.
- [x] Every outline is drawn inside its Node's rectangle.
- [x] The Notation sets each Kind's width.
- [x] The header leaves room for the badge. A title that would touch the badge is shortened first.

**External, status and callout**

- [x] `external` draws a dashed outline.
- [x] `status` takes one of `ok`, `degraded`, `down` or `unknown`. Each status has a mark of its own shape and color. Any other value is both a type error and a validation error.
- [x] `callout` draws a highlighted outline and a short tag above its Node. Layout leaves room for the tag.

**Colors**

- [x] Every color is a `--diagram-` custom property with a fallback value.
- [x] A `prefers-color-scheme: dark` rule repeats those uses with dark fallback values.
- [x] A test finds no literal color anywhere else in the SVG.
- [x] Text has a contrast ratio of at least 4.5:1 against its fill, in both themes.

**Checks**

- [x] Golden files cover every Kind, an External Node, every status, and a callout.
- [x] The example Diagram uses several Kinds, one External Node and one status.

## Comments

**Implementation, 4 November 2026** (branch `t3/984c20c9`). Choices the spec left open are recorded in its "Decisions made during implementation".

- **Manual check, by eye.** In headless Chrome 156, as an `<img>`, with the color scheme forced each way through `--blink-settings=preferredColorScheme`: every Kind on its own, External, with each status, with callouts and with Rows; both golden files; and the example. Each Kind can be told apart before its title is read, in grayscale too: the person's head and shoulders, the database's cylinder, the queue's pipe, and the system's heavy border and darker fill. Text reads clearly in both themes.
- **Manual check, a page restyles the SVG.** Inlined in a page that defines a few `--diagram-` properties, the SVG took the page's colors in both schemes. The same SVG as an `<img>` kept its own fallbacks, and the inlined style didn't reach the page's own text.
- **Fuzzing.** 3,000 random Diagrams, mixing every Kind, status, External and callout, in both directions, kept the grid, the bounds and the clearance with their tags, and routed every Edge clear of every tag. A sample of them drew every shape inside its Node or its tag.
- **Merged with tickets 03, 05 and 08** before finishing. Each outline now holds its Node's Rows and meets the Node's sides at every Port, and the router keeps routes clear of tags. Three of ticket 08's tests changed. Two leaned on a title centered across the whole Node, and on a line above the Rows from edge to edge; they now check the rules themselves: a `down` header Port at the middle of the top side, and a line from side to side inside the outline. The third read each `<text>` by its attributes' order, and now allows the class that every text carries.
- **Not checked: GitHub.** The repo still has no remote. An `<img>` in Chrome honors the style's `@media (prefers-color-scheme: dark)`, `var()` and `currentColor`. GitHub's theme and the system's can disagree, so the SVG paints its own background.
- **For later tickets.**
  - Ticket 13: resvg reads neither `var()` nor `@media`, so export has to resolve the theme first. Spec decision 15 under ticket 07 says how.
  - Beside a status mark, a title has 108 px on most Kinds, so `Orders database` (113 px) is shortened when it has a status, and lint warns.
  - The spec's words status, callout, badge, outline and hue have no glossary entries yet.

Merged into diagram-engine in e068700.
