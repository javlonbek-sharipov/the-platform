# Diagram engine v1

Status: ready-for-agent

The spec for `@the-platform/diagrams`, rewritten on 4 November 2026 after the design session. Its words are defined in the Diagrams glossary (`packages/diagrams/GLOSSARY.md`). The decisions that are hard to reverse are recorded in ADR-0001 to ADR-0005 (`packages/diagrams/docs/adr/`).

## Read this first

This spec says what the engine does and which algorithms it uses. Its authors studied the board renderer in `repos/quorum`, which is licensed GPL-3.0-or-later. The spec contains none of that code, and our engine must not contain any either: it is an independent implementation, under our own license (ADR-0001).

If you implement from this spec:

- Work only from these sources:
  - this spec;
  - the Diagrams glossary and ADRs;
  - the papers in [References](#references);
  - the public documentation of the formats and tools we use, such as SVG, OpenType, Node.js, Vitest and Astro Starlight.
- Do not open `repos/quorum`. Do not read or port other copyleft implementations of these algorithms either, such as libavoid (LGPL) or ELK (EPL).
- Choose your own names, module layout and constants. Every number in this spec is a starting point to tune.
- In code, tests and messages, use the glossary's words, never the ones it lists under _Avoid_.
- When this spec leaves a question open, decide it yourself and record the decision under [Decisions made during implementation](#decisions-made-during-implementation).

## Problem Statement

the-platform is a large project that has just started. The people who work on it, and the agents that work with them, need to understand how it is designed:

- which systems and services exist, where they run, and how they talk to each other;
- which bounded contexts the domain has, and how those contexts relate;
- which aggregates and domain events each context holds.

Today that knowledge lives in prose, in people's heads, or in hand-drawn pictures that go stale as soon as the design changes.

The tools we could use each fall short:

- **Drawing apps** make people place boxes by hand, and keep drawings outside the repo, so nobody updates them.
- **Text tools such as Mermaid and D2** keep drawings in the repo, but every drawing stands alone:
  - renaming a service means finding every drawing that mentions it;
  - nothing checks that two drawings agree;
  - nothing ties a drawing to the glossary and decisions that explain it.

  On GitHub their output is static.
- **quorum's board** draws the way we want, but it is GPL code written for a game, and we want our own license.

## Solution

`@the-platform/diagrams` is our own diagram engine, a private package in the-platform's monorepo.

People and agents write each Diagram as a small TypeScript module next to the doc it illustrates, using a typed API for its Notation:

- architecture first;
- then domain, which covers context maps and aggregate diagrams.

The module compiles to a versioned JSON model. The engine then:

1. lays the Diagram out automatically;
2. routes every Edge in horizontal and vertical runs around the Nodes;
3. writes a self-contained SVG, which is committed next to the source.

GitHub shows that SVG in Markdown, with flow animation and both light and dark themes. A web component that needs no framework makes the same SVG explorable. Readers can:

- pan and zoom;
- highlight everything a Node depends on and everything that depends on it;
- open a Node's details;
- move between Nodes with the keyboard;
- play Walkthroughs that show, step by step, how something happens.

Every Diagram in the repo belongs to one Atlas, so an id means the same thing everywhere. `diagrams lint` checks the Atlas as a whole:

- each id has one Kind and one title;
- every Link resolves;
- labels use the glossary's words;
- every SVG matches its source.

Each group of users gets something of its own:

- **Agents** get a skill that teaches the API, and a PNG export so they can see what they drew.
- **Authors** get a live preview that redraws on every save.
- **Readers** get a Starlight docs site where Diagrams, glossaries, ADRs and specs sit side by side, each one a click away from the others.

## User Stories

**Writing Diagrams**

1. As an author, I want to write a Diagram as a TypeScript module next to the doc it illustrates, so that the Diagram changes together with the text that explains it.
2. As an author, I want my editor to autocomplete Kinds, Edge Kinds, roles, statuses and Row names, so that I don't need to look them up.
3. As an author, I want a misspelled Kind or Row name to be a type error, so that I see mistakes while I type.
4. As an author, I want to define a Node once in a shared module and use it in several Diagrams, so that its id, Kind and title are written in one place.
5. As an author, I want to nest Groups by declaring their members inside them, so that the structure of the source matches the structure of the drawing.
6. As an author, I want to choose left-to-right or top-to-bottom for each Diagram, so that each one reads in the direction that suits it.
7. As an author, I want declaration order to break layout ties, so that I can steer the layout without writing coordinates.
8. As an author, I want to give a Node Rows such as `replicas: 3`, so that its key facts show on the drawing.
9. As an author, I want to give a Node a description and Links, so that readers can learn more without crowding the drawing.
10. As an author, I want to draw two Edges between the same pair of Nodes, so that a REST call and an event between the same two services both show.
11. As an author, I want an Edge from a Node to itself to be drawn as a loop, so that self-calls show.
12. As an author, I want to give an Edge a label, a Technology and a rate, so that readers see what passes over it, how it travels, and how much of it there is.
13. As an author, I want to attach an Edge to one Row of a Node, so that I can show which part of the Node it concerns.
14. As an author, I want error messages that name the file and line, so that I can fix an invalid Diagram quickly.
15. As a tool author, I want to generate the JSON model directly, so that tools such as importers can produce Diagrams without writing TypeScript.
16. As a tool author, I want a JSON Schema for the model, so that I can validate what my tool writes.
17. As a tool author, I want the model to carry a version number, so that a future format change can't silently misread old files.

**Architecture**

18. As an architect, I want Kinds for people, systems, clients, gateways, services, workers, functions, databases, caches, queues, storage and search, so that each common building block has its own look.
19. As a reader, I want each Kind recognizable by its outline and badge, even in grayscale, so that I can tell a database from a queue before I read its title.
20. As an architect, I want to mark a Node External, so that readers see at a glance what we don't own or run.
21. As an architect, I want to give a Node or an Edge a Technology, shown with its logo, so that readers see we use Postgres or gRPC without reading notes.
22. As an architect, I want `call` and `message` Edges to look different, so that synchronous and asynchronous communication can't be confused.
23. As an architect, I want `system`, `region` and `zone` Groups, so that I can show what belongs together and what runs where.
24. As a reader, I want Edges that cross between regions or zones to stand out, so that I notice the calls that cost latency and egress.
25. As an architect, I want to give a Node a status that shows as both a shape and a color, so that degraded or down parts stand out for everyone, including readers who don't see color.
26. As an architect, I want to put a callout such as "single point of failure" on a Node, so that I can point readers at a risk.
27. As an architect, I want a `system` to be a Node on the overview and a Group on its own Diagram, under the same id, so that readers can drill down from the overview into the system.

**Domain**

28. As a domain modeler, I want to draw a context map of the-platform's bounded contexts, so that everyone sees how the contexts relate.
29. As a domain modeler, I want `partnership` and `shared-kernel` Edges drawn without arrowheads, so that a two-way pattern doesn't look one-sided.
30. As a domain modeler, I want `upstream-downstream` and `customer-supplier` Edges to run from upstream to downstream, so that the direction of influence is visible.
31. As a domain modeler, I want to tag each end of a context-map Edge with OHS, PL, CF or ACL, so that each side's way of integrating is explicit.
32. As a domain modeler, I want to mark a context we don't own as External, so that it stands apart from ours.
33. As a domain modeler, I want an aggregate diagram for one bounded context, so that its aggregates and domain events can be seen together.
34. As a domain modeler, I want each aggregate drawn as one Node whose Rows list its entities, value objects and invariants, so that its contents show without a separate shape for each entity.
35. As a domain modeler, I want `references`, `emits` and `reacts` Edges, so that references between aggregates, and the paths that events take, are explicit.
36. As a domain modeler, I want ids inside a context to be local, so that I can write `order` in Billing and have it mean `billing/order`.
37. As a domain modeler, I want Ordering's `order` and Billing's `order` to stay two different things, so that each bounded context keeps its own meaning.
38. As a domain modeler, I want to show another context's event outside my context, under its full id, so that cross-context reactions are visible and lead back to where the event belongs.
39. As a domain modeler, I want Nodes to carry Links to glossary terms, so that readers can reach the definition of each word on the drawing.

**Layout and routing**

40. As an author, I want layout to be fully automatic, so that I never place anything by hand.
41. As a reader, I want Edges drawn as horizontal and vertical runs with rounded corners, so that the drawing is easy to follow.
42. As a reader, I want Edges never to pass under a Node or a Group's label, so that nothing is hidden.
43. As a reader, I want Edges that go into the same Node to merge into one trunk, so that a busy Node doesn't sprout a tangle of lines.
44. As a reader, I want Edges that share a corridor to run side by side in separate lanes, without crossing each other needlessly, so that I can follow each one.
45. As a reader, I want a small hop where two unrelated Edges cross, so that I can see they don't connect.
46. As a reader, I want each Edge label on a long straight run, clear of Nodes and other labels, so that I can read it.
47. As a reader, I want long titles shortened with an ellipsis instead of spilling out, so that the drawing never breaks and the full text is one click away.
48. As an author, I want a small change in the source to make only a small change in the drawing, so that the drawing stays familiar and its diff stays small.
49. As an author, I want an Edge that can't be routed well to be drawn anyway, with a warning, so that nothing disappears silently.
50. As an author, I want a route between two Nodes in the same Group to stay inside that Group when it can, so that Groups stay readable.

**Static SVG and GitHub**

51. As a reviewer, I want each Diagram's SVG committed next to its source, so that I see the drawing in GitHub's Markdown and in pull requests.
52. As a reviewer, I want the same source always to produce a byte-identical SVG, so that a diff shows only real changes.
53. As a doc author, I want to embed a Diagram with plain Markdown image syntax, so that the same Markdown works on GitHub and on the docs site.
54. As a reader on GitHub, I want flow animation along the Edges of an architecture Diagram, so that I can see which way things move without any JavaScript.
55. As a reader on GitHub, I want the SVG to follow my light or dark theme, so that it's readable in either.
56. As a reader, I want the text in a Diagram to look the same on every machine, so that no title overflows because a font is missing.
57. As a screen-reader user, I want each SVG to have a title and a description that lists its Nodes and Edges, so that I know what it shows.

**Lint and the CLI**

58. As an author, I want `diagrams render` to write every SVG next to its source, so that one command updates every drawing.
59. As an author, I want `diagrams lint` to fail when an SVG no longer matches its source, so that stale drawings can't be committed.
60. As an author, I want lint to fail when one id has two Kinds or two titles across the Atlas, so that a renamed thing gets renamed everywhere.
61. As an author, I want lint to fail when a Link points at nothing, so that a "see also" never leads nowhere.
62. As an author, I want lint to fail on an SVG whose source is gone, so that deleted Diagrams leave nothing behind.
63. As a domain modeler, I want lint to warn when a label uses a word that the context's glossary avoids, and to suggest the right term, so that Diagrams speak the same language as the glossary.
64. As an author, I want lint to warn when it had to shorten a title or label, so that I can choose a shorter name myself.
65. As an author, I want the pre-commit hook to run Biome and `diagrams lint`, so that broken or stale Diagrams never reach a commit.
66. As an agent, I want lint's output as JSON, so that I can act on it without parsing prose.

**Agents**

67. As an agent, I want a short skill that teaches the authoring API and the Notations, so that every agent writes Diagrams the same way.
68. As an agent, I want to export a Diagram as a PNG, so that I can look at what I drew and fix it before I finish.
69. As the project owner, I want agents to use the glossary's words in Diagrams, so that the drawings and the docs agree.

**Live preview**

70. As an author, I want `diagrams dev` to show my Diagram in a browser and redraw it on every save, so that I see the effect of each edit right away.
71. As an author, I want Nodes to glide to their new places when I edit, so that I can follow what my edit changed.
72. As an author, I want errors shown in the preview with their file and line, while the last good drawing stays on screen, so that a typo doesn't blank the screen.
73. As an author, I want the preview to notice changes to imported modules, the config and the glossaries, so that I never have to restart it.
74. As an author, I want `diagrams dev` to keep the SVG on disk up to date, so that I don't forget to render before I commit.

**Exploring in the web component**

75. As a reader, I want to pan, zoom, and fit the Diagram to the view, so that I can explore large drawings.
76. As a reader, I want hovering over or selecting a Node to highlight everything upstream and downstream of it and fade the rest, so that I see what it depends on and what depends on it.
77. As a reader, I want clicking a Node to show its details, so that I can learn more about it. The details are its Kind, Technology, status, Rows, description and Links, and the other Diagrams it appears on.
78. As a reader, I want hovering over an Edge to highlight it and show its full label, Technology and rate, so that I can follow one connection.
79. As a keyboard user, I want to move between Nodes with the arrow keys and open details with Enter, so that I can explore without a mouse.
80. As a screen-reader user, I want a list of the Nodes, and of the Edges as sentences, in layout order, so that I can understand the Diagram without seeing it.
81. As a reader, I want Rows to fade out as I zoom out, so that the overview stays readable.
82. As a reader, I want to drill down from a Node into the Diagram where its id is a Group, so that I can move from the overview to the detail.
83. As a reader, I want hovering over a Node that has a glossary-term Link to show the term's definition, so that I learn the project's language where I meet it.
84. As a reader, I want find-in-page to find text inside Diagrams, so that I can find a Node by its name.
85. As a reader, I want the mouse wheel to scroll the page unless I've clicked into the Diagram, so that an embedded Diagram doesn't trap my scrolling.
86. As a site author, I want the web component to work in any page without a framework, so that any future the-platform app can embed it.
87. As a site author, I want the component to take its colors from CSS variables, so that it matches the page's theme.

**Animation and Walkthroughs**

88. As a reader, I want flow marks to move faster and closer together on busier Edges, so that I see where the load is.
89. As an author, I want to write Walkthroughs as ordered Steps on a Diagram, so that I can show how something such as checkout happens.
90. As a reader, I want to play a Walkthrough one Step at a time, with each Step's Edges or Node highlighted and its note shown, so that I can follow what happens, in order.
91. As an author, I want a Step to run an Edge backwards, so that a reply shows without a second Edge.
92. As an author, I want a Step to highlight several Edges at once, so that parallel calls show together.
93. As a reader who prefers reduced motion, I want all animation turned off, so that the Diagram is comfortable to use.
94. As a reader, I want highlights to fade in and out smoothly instead of flashing, so that I keep my bearings.

**Docs site**

95. As a teammate, I want a docs site that shows the Diagrams, glossaries, ADRs and specs together, so that I can understand the-platform in one place without running anything.
96. As a teammate, I want Diagram images on the site to become interactive, so that I can explore each Diagram where I read about it.
97. As a teammate, I want a Node's Links to open the glossary entry, ADR or spec section on the site, so that I can move between a drawing and its explanation.
98. As a teammate, I want a URL that points at one Node on a Diagram, so that a spec or a chat message can send me straight to it.
99. As a teammate, I want Diagrams to follow the site's light/dark switch, so that they always match the page.

**Engine maintainers and the project owner**

100. As an engine maintainer, I want the core to have no runtime dependencies and no file or network access, so that it stays small, is easy to test, and runs anywhere.
101. As an engine maintainer, I want the scene to be independent of SVG, so that another renderer can be added later without touching layout or routing.
102. As an engine maintainer, I want a crowded benchmark fixture, so that I notice when layout or routing gets slower.
103. As the project owner, I want the engine built clean-room, kept private, and left unlicensed for now, so that I can choose its license at the first publish.
104. As the project owner, I want dependencies limited to permissive licenses, so that none of them narrows that choice.

## Implementation Decisions

### Order of work

v1 is built in five slices, and each one ends with something people can use.

1. **Static architecture Diagrams, end to end**:
   - the authoring API and the JSON model;
   - the architecture Notation;
   - layout, Edge routing, and static SVG without animation;
   - the Atlas and its config;
   - `diagrams render`, and `diagrams lint` including the out-of-date SVG check;
   - PNG export;
   - the agent skill.
2. **The domain Notation**:
   - context maps and aggregate diagrams;
   - context namespaces;
   - glossary-term Links;
   - the lint that checks labels against each context's glossary.

   The agent skill also learns the domain Notation.
3. **The interactive web component and the live preview**:
   - pan, zoom, and fit;
   - focus, and details, including the other Diagrams an id appears on;
   - keyboard navigation, and the screen-reader list;
   - level of detail;
   - transitions on every edit in `diagrams dev`.
4. **Animation**: flow animation, in the static SVG and in the web component, and then Walkthroughs.
5. **The docs site**:
   - Starlight, with Diagram images replaced by the web component;
   - drill-down between Diagrams;
   - Links that open glossary entries, ADRs and spec sections.

### Package and tooling

**Layout and status**

- the-platform is a pnpm monorepo:
  - the engine is the package `@the-platform/diagrams`, in `packages/diagrams`;
  - the docs site is an app in `apps/docs`.
- The repo root depends on the package, so that diagram modules anywhere in the repo can import it.
- The package is private, with `"license": "UNLICENSED"`, and is never published for now. Its public name and its license get chosen at the first publish.

**Tools**

- TypeScript, as ES modules only, on Node 24.
- Vitest for tests.
- Biome for formatting and linting.
- A lefthook pre-commit hook runs Biome and then `diagrams lint`.
- No CI until the repo has a remote.

**No build step, where possible**

- Node 24 runs TypeScript directly by stripping its types. So the engine's sources and every diagram module:
  - use only erasable TypeScript syntax: no enums, no namespaces, no parameter properties;
  - import each other with `.ts` extensions.
- The live-preview server strips types itself when it sends the web component's modules to the browser.
- Vite strips them for the docs site.
- Add a build or a bundler only when something needs one.

**Dependencies**

- The core has no runtime dependencies and never touches the file system or the network, so it runs in Node and in browsers. The core is the authoring API, the model, the Notations, layout, routing, the scene and the SVG writer.
- Only the Node-only parts may depend on a few libraries, such as an SVG-to-PNG rasterizer or a font subsetter.
- Every dependency needs a permissive license: MIT, BSD, ISC or Apache-2.0.
  - MPL-2.0 is acceptable for an unmodified dependency of the CLI.
  - Never GPL, LGPL or AGPL: they would narrow the license choice that ADR-0001 keeps open.

**Bundled assets**

- The bundled font is Inter, under the SIL Open Font License 1.1. It ships as static TrueType files in the two weights the renderer uses: regular for Rows and labels, and semibold for titles. Its license ships beside it.
- Technology logos come from Simple Icons (CC0). They're copied into the package as a generated table of the Technologies we support: slug, display name and path data. Logos are drawn in one theme color, not in brand colors.

**Git settings**

- `.gitattributes` marks `*.diagram.svg` as text with LF line endings, so that a checkout on any OS matches a fresh render byte for byte.
- Generated SVGs are never git-ignored (ADR-0004).

### Modules

The engine is a few deep modules with small interfaces. Each of the three test seams is the public surface of one of them.

1. **Authoring API.**
   - Holds one builder per Notation, the helper for the Atlas config, and the JSON model's types.
   - A diagram module calls a builder and default-exports the result, which is the JSON model itself.
2. **Core** (seam 1).
   - One entry point takes a Diagram, built by the authoring API or read from JSON.
   - It returns the Diagram's diagnostics, its scene, and its SVG. The scene and the SVG are missing if there are errors.
   - Inside are validation, the Notation rules, layout, routing, the scene and the SVG writer.
   - It is pure and deterministic.
   - The SVG writer works out which glyphs it needs, and asks a function passed in by the caller for the font data. That function comes from the Node side, or from a test helper.
3. **Atlas** (Node only).
   - Finds the config and every diagram module, and loads them.
   - Reads the glossaries.
   - Runs the checks that span Diagrams.
   - Compares the SVGs on disk with fresh renders.
   - Builds the Atlas index.
   - The CLI, the live-preview server and the docs site all use it.
4. **CLI** (seam 2).
   - `diagrams` with the commands `render`, `lint`, `export` and `dev`.
   - It is written as a function that takes arguments, a working directory and output streams, and returns an exit code.
   - The `diagrams` binary only calls that function.
5. **Live-preview server** (Node only, started by `diagrams dev`).
   - Serves a page for each Diagram.
   - Watches files and rebuilds after changes.
   - Pushes the new SVGs to open pages.
6. **Web component** (seam 3, browser only).
   - `<platform-diagram>`.
   - Makes an engine-made SVG explorable, animates it, and plays its Walkthroughs.
7. **Agent skill.**
   - Markdown that teaches agents to write Diagrams.
   - It lives in the package, and AGENTS.md points agents to it.
8. **Docs site integration**, in the docs app.
   - Swaps Diagram images for the web component.
   - Gives the component the Atlas index and a function that turns Links into URLs.

### The JSON model

The JSON model is the one stable, versioned format (ADR-0003). The authoring API produces it, generators may write it directly, and the package ships a JSON Schema for it.

**Version 1 fields**

- **Diagram**:
  - `version`: `1`.
  - `notation`: `architecture` or `domain`.
  - `id` and `title`.
  - Optional `description`.
  - `direction`: `right` (the default) or `down`.
  - `members`: the ids of its top-level Nodes and Groups, in declaration order.
  - Lists of `nodes`, `groups`, `edges` and `walkthroughs`.
- **Node**:
  - `id`, `kind` and `title`.
  - Optional `technology`, `external`, `status`, `rows`, `description`, `links` and `callout`.
- **Row**:
  - `name`, and an optional `value`.
  - Every Row has a pair of Ports, one on each side of its Node.
- **Group**:
  - `id`, `kind` and `title`.
  - `members`: the ids of its Nodes and child Groups, in declaration order.
  - Optional `description` and `links`.
- **Edge**:
  - `id` and `kind`.
  - `from` and `to`: each is a Node id, optionally with the name of one of that Node's Rows.
  - Optional `label`, `technology` and `rate`.
  - Optional `roles`: for each end, a list of role tags.
- **Walkthrough**:
  - `id`, `title` and `steps`.
  - A Step has either `edges` or one `node`, and an optional `note`.
  - Each entry in `edges` is an Edge id. It may be marked `back`, which runs the Edge from its `to` end to its `from` end.
- **Link**: exactly one of the following, plus an optional `label` that replaces the text shown:
  - `id`: another id in the Atlas.
  - `term`: a glossary term. It takes a `context` when the Node isn't inside that context.
  - `doc`: the repo path of a Markdown file, such as an ADR or a spec, with an optional `section` heading.

**Rules**

Breaking any of these is a validation error.

- **Ids.**
  - Ids are lowercase kebab-case words.
  - Inside a Group of Kind `context`, a member's full id is the context's id, a slash, and its local id: `order` in Billing is `billing/order`.
  - The JSON model always holds full ids. Only the authoring API accepts local ones.
  - Node and Group ids are unique within a Diagram, and they name the same thing across the whole Atlas.
  - Edge ids only need to be unique within their Diagram.
  - The authoring API names an Edge without an explicit id after its two ends, as in `checkout-api->payments-api`. When two Edges would get the same name, both must be given ids.
- **Nesting.**
  - Every Node and Group is a member of exactly one parent: the Diagram itself or one Group.
  - So Groups nest as a tree, and each Node has at most one Group.
- **Edges.**
  - An Edge's ends are Nodes on the same Diagram, never Groups.
  - Two Edges may join the same pair of Ports.
  - An Edge may join two Ports of one Node, and is then drawn as a loop beside it.
- **Kinds.**
  - `kind` must be one of the Notation's Kinds for a Node, Group or Edge, as the case may be.
  - An Edge's ends must have Kinds that its Edge Kind allows.
- **Values.**
  - `status` is one of `ok`, `degraded`, `down` and `unknown`.
  - `rate` is a number, an optional `k` or `M`, a slash, and then `s`, `min` or `h`, as in `2k/s` or `30/min`.
  - `technology` is a slug, such as `postgres` or `grpc`. A slug without a logo is drawn as its name only, which isn't an error.
- **Walkthroughs.** A Step's Edges and Node must exist on its Diagram.

### The authoring API

**Diagram modules**

- A diagram module is a file named `<name>.diagram.ts`, kept next to the doc it illustrates.
- It default-exports one Diagram, built with its Notation's builder.
- It must be deterministic and free of side effects: no clock, no randomness, and no network or file access.
- The Diagram's `id` is the module's path from the repo root, minus `.diagram.ts`.

**Building a Diagram**

- The builder has functions that declare Nodes, Groups, Edges and Walkthroughs.
- Declaring a Node or a Group returns a handle that later calls accept, so an Edge drawn between handles can't name a missing Node.
- An Edge may also name a Node by its id, for Nodes declared elsewhere on the same Diagram, such as an event from another context.
- Members are declared inside a Group's callback. That way, each Node gets exactly one Group by construction.
- Inside a `context` Group, ids are written locally, and the builder turns them into full ids.
- A Node can be defined as a plain object in a shared module and passed to several Diagrams. Its id, Kind and title are then written only once.

**Types and validation**

- Kinds, Edge Kinds, roles and statuses are literal types for each Notation, so the editor autocompletes them and a typo is a type error.
- A Node handle carries the names of its Rows, so naming a missing Row on an Edge end is also a type error.
- `technology` autocompletes the known slugs, but accepts any string.
- Validation is the authority, not the types: everything the types prevent is also checked at run time, because generated JSON has no types.
- Each declaration should record the file and line it was called from, so that diagnostics can point there.

### The Atlas

**What it contains**

- The Atlas is every `*.diagram.ts` file in the repo, plus one config file at the repo root, `diagrams.config.ts`.
- It leaves out files that git ignores, such as the reference clones in `repos/`.

**Config and glossaries**

- The config lists the bounded contexts that have a glossary: for each context id, the path of its `GLOSSARY.md`.
  - A context with no entry is allowed.
  - It just gets no glossary checks and no term Links.
- Glossaries are read in the format that the repo's glossaries use:
  - a bold term, followed by a colon, on a line of its own;
  - its definition below it;
  - an optional `_Avoid_:` line listing words separated by commas.

  Each term gets an anchor made from its name.

**The Atlas index**

- The Atlas index is a JSON file, built on demand and never committed. It lists:
  - every Diagram: its id, title and Notation, and where its SVG is;
  - every id: its Kind and title, and the Diagrams that draw it as a Node or as a Group;
  - every glossary term: its context, its definition, and the words it avoids.
- The live-preview server and the docs site give the index to the web component. The component uses it for:
  - drill-down;
  - the list of other Diagrams an id appears on;
  - term definitions.

### Notations

A Notation defines:

- which Kinds of Nodes, Groups and Edges it allows;
- which Node Kinds each Edge Kind may join;
- how each Kind looks: its outline, badge, hue and size;
- a sentence form for each Edge Kind, for screen readers and the SVG's description, such as "A calls B".

A thing's Kind alone decides how it looks.

#### Architecture

**Nodes**

- The Node Kinds are:
  - `person`, `system` and `client` (a web or mobile app);
  - `gateway` (an API gateway, load balancer or CDN);
  - `service`, `worker` and `function`;
  - `database`, `cache`, `queue`, `storage` and `search`.
- No Kind is called `edge`, because Edge is a core term.
- Each Kind can be recognized before its title is read, even in grayscale. For example:
  - a person is drawn as a figure;
  - a database as a cylinder;
  - a queue as a pipe;
  - a `system` looks heavier than a `service`.
- Any Node may have a Technology, drawn as its logo and its name.
- Any Node may be External, drawn with a dashed outline.

**Groups**

- The Group Kinds are `system`, `region` and `zone`.
- One id can be a `system` Node on one Diagram and a `system` Group on another. That's how drill-down works.

**Edges**

- `call` is drawn solid with an arrowhead. `message` is drawn dashed with an arrowhead.
- Both may have a label, a Technology and a rate.
- Each may join any two architecture Node Kinds.
- An Edge whose ends sit in different `region` Groups, or in different `zone` Groups, gets a warning color and a small badge at its midpoint. Such calls cost latency and egress.

#### Domain

A domain Diagram is either a context map or an aggregate diagram, never both. A mix of the two is a validation error.

**Context map**

- **Nodes.**
  - Every Node has the Kind `context`.
  - A context that we don't own, such as a payment provider's, is a `context` marked External.
- **Edge Kinds.**
  - `partnership` and `shared-kernel` are symmetric, and are drawn without arrowheads.
  - `upstream-downstream` and `customer-supplier` run from the upstream context to the downstream one.
- **Roles.** Each end of a directed Edge may carry roles, drawn as short tags at that end.
  - The upstream end may have OHS (open host service), PL (published language), or both.
  - The downstream end may have CF (conformist) or ACL (anticorruption layer), but not both.
  - Symmetric Edges take no roles.
- **Separate ways.** Two contexts that go "separate ways" have no Edge between them.

**Aggregate diagram**

- **The context.**
  - The bounded context is a Group of Kind `context`.
  - Its members' ids are namespaced by it.
- **Nodes.**
  - The Node Kinds are `aggregate` and `event`.
  - Each aggregate is one Node (ADR-0005).
  - Its Rows list the aggregate's entities, value objects and invariants, such as `OrderLine: entity`.
- **Edge Kinds.**
  - `references` runs from aggregate to aggregate.
  - `emits` runs from aggregate to event.
  - `reacts` runs from event to aggregate.
- **Events from other contexts.**
  - An event from another context is drawn outside the Group, under its full id, such as `ordering/order-placed`.
  - Clicking it opens the Diagram where it sits inside its own context.

**Both forms**

- One id can be a `context` Node on the context map and the `context` Group of that context's aggregate diagram.
- Nodes may carry Links to glossary terms. A term Link is looked up in the glossary of the Node's own context, unless the Link names another context.
- Domain Edges get no flow animation.

### Layout

**Principles**

- Layout is automatic, and a pure function of the JSON model. There are:
  - no coordinates in the source;
  - no randomness;
  - no memory of earlier layouts.

  So the committed SVG always matches a fresh render (ADR-0004).
- Authors steer layout only through:
  - the Diagram's direction;
  - the nesting of Groups;
  - declaration order, which breaks every tie.

**Axes**

Below, the "rank axis" runs along the direction: x for `right` and y for `down`. The "order axis" runs across it.

**Steps**

1. **Sizes.** A Node's size follows from its Kind and its Rows:
   - a width set by its Kind;
   - a header band for its badge, logo and title;
   - one band per Row.

   An outline that isn't a rectangle, such as a cylinder, is drawn inside the same rectangle. Text never changes a Node's size:
   - a title too long for its Kind's width is shortened with an ellipsis before it would touch the logo;
   - a Row's name is shortened before its value is;
   - lint warns about every shortened text.
2. **Measuring text.** Text is measured with metrics generated from the bundled font.
   - Node and browsers therefore measure alike, and layout needs no font file.
   - Measuring ignores kerning and ligatures, and the SVG turns both off, so drawn text matches measured text.
   - A character the font lacks is measured at an average width, and lint warns about it.
3. **Levels.** Groups are laid out from the inside out.
   - A level is the Diagram itself, or one Group.
   - Each level lays out its own children together.
   - A child Group counts as a single block of the size it has already been given.
   - An Edge between Nodes inside two different children counts as a connection between those two children.
   - An Edge that leaves the level is ignored at that level.
4. **Ranks.**
   - Find each level's cycles with a depth-first search that starts from the children in declaration order.
   - Leave out of ranking any Edge that leads back into the current search path.
   - Give every other child the length of the longest path that reaches it.
   - Self-loops don't count, and parallel Edges count once.
5. **Order.**
   - Within each rank, start from declaration order.
   - An Edge that spans several ranks gets a placeholder in each rank it passes through.
   - Then sweep the ranks forward and backward a fixed number of times. Each sweep sorts each rank by the average position of its neighbors in the rank placed just before, and keeps the current order on ties.
   - Keep the order with the fewest crossings. On a tie, keep the earlier one.

   Since every tie keeps the existing order, moving a line in the source moves its Node only as far as crossings allow.
6. **Coordinates.**
   - Each rank becomes a column (for `right`) or a row (for `down`), with its members centered on the rank's line.
   - Within a rank, members are stacked along the order axis, at least the clearance apart.
   - Each gap between two ranks leaves room for the labels and lanes of the Edges that span it.
   - Then align each child with its connected neighbors, wherever that keeps the order and the clearance. Brandes and Köpf (2001) is the reference.
   - Snap every position to a small grid.
7. **Groups.**
   - A Group's box is the bounds of its children, plus padding on every side and a label band along the top.
   - The padding is more than half the clearance, so none of the routing grid's lines falls on a Group's border.
8. **Clearance.**
   - Every Node keeps a margin of clearance around it, which no other Node and no Group label may enter.
   - That guarantees a corridor between any two Nodes for Edges to run in. The router relies on it.

### Ports

- **Header Ports.** Each Node has one input Port and one output Port, level with its header:
  - for `right`, on its left and right sides;
  - for `down`, on its top and bottom.
- **Row Ports.** Each Row has a Port on its Node's left side and one on its right side, whatever the direction.
- **Stubs.** Every Port has a short, straight stub, so an Edge leaves and enters its Node at a right angle to the side.
- **Which Ports an Edge uses.**
  - An Edge leaves from its `from` Node's output Port, or from the named Row's Port on that side.
  - It enters its `to` Node's input Port, or the named Row's Port on that side.
  - An Edge that runs against the direction still leaves from an output and enters at an input, and so does a self-loop. The router takes them around.

### Edge routing

This is the core of the engine.

- Edges are orthogonal: horizontal and vertical runs, joined by rounded corners.
- No Edge runs under a Node or a Group label.
- Edges that share a corridor spread apart instead of overlapping.
- Edges cross as little as possible.
- Routes may cross Group borders, but never run along them.

The method comes from Wybrow, Marriott and Stuckey (2009), Marriott, Stuckey and Wybrow (2014), and McMurchie and Ebeling (1995).

**Steps**

1. **Grid.** Build a sparse orthogonal grid.
   - Place lines parallel to each side of each Node, half a clearance outside it, and at the end of each Port's stub.
   - Do the same around each Group label band.
   - Add one more line on each side, outside the whole drawing, so a route can go around everything.

   Each line sits half a clearance from a Node, so a line runs down the middle of even the narrowest corridor.
   - The grid's vertices are the points where lines cross, outside every Node and label.
   - A segment between two neighboring vertices is open when it doesn't pass through a Node or a label.
2. **Capacity.**
   - For each open segment, measure the free width across it: the distance to the nearest obstacle on each side.
   - That width divided by the lane spacing is the number of lanes that fit.
3. **Search.** Route each Edge with A\* over states of (vertex, direction of travel).
   - A route runs from the end of its source Port's stub to the end of its target Port's stub.
   - A step costs its length, plus:
     - a fixed cost for each bend;
     - a penalty for using a segment that's already full;
     - a small cost for crossing a Group border, so that a route between two Nodes in one Group stays inside it when it can.
   - A bend should cost about as much as a few dozen pixels of length, which favors routes with few bends.
   - U-turns aren't allowed.
   - The heuristic is the Manhattan distance to the target.
4. **Bundling.** Edges of the same Kind that go to the same Port share one trunk.
   - Route the first such Edge.
   - Each later one may end its search as soon as it reaches the trunk, as long as it joins from the side and not head-on.
   - A trunk segment counts once against capacity, however many Edges ride on it. So a corridor's width grows with the number of targets passing through it, not with the number of Edges.
   - Parallel Edges, two Edges that join the same pair of Ports, never share a trunk. Each keeps its own lane along its whole length, so each stays visible with its own label.
   - The bundle key is a parameter, because the data model Notation will want to bundle by source Port, or not at all.
5. **Negotiation.**
   - After routing every Edge, raise a lasting history cost on each segment that holds more lanes than fit, then route everything again.
   - A few passes are enough. Stop early once no segment is over capacity.
   - Route Edges in a stable order, sorted by bundle key and then by Edge id, so that the result is deterministic.
6. **Nudging.** Spread apart the lanes that share a grid line.
   - On each line, collect the runs: stretches along that line used by one bundle.
   - Runs that overlap along the line form an overlap set.
   - Sort each overlap set so that its lanes don't cross. To compare two runs, look at which way each one turns at its ends, and put a run that turns toward lower coordinates on the lower side.
   - Then space the set evenly around the line, at the preferred lane spacing.
   - In a narrow corridor, squeeze the spacing down to a minimum, and shift the whole set so that every lane stays inside the corridor with some padding.
7. **Polylines.**
   - Walk each Edge's path through the grid, merging consecutive steps in the same direction, and offset each run by its lane.
   - Where a Port's stub meets a lane at a different height, add a short jog.
8. **Labels.** Place each label, with its Technology and rate below it.
   - Use the longest straight run that belongs to that Edge alone, not to a shared trunk, and center the label beside the line.
   - If it would cover a Node, a Port stub, a Group label or another label, try the next-longest run.
   - If nothing fits, put it at the route's midpoint and report a warning.
9. **Crossings.**
   - Where two Edges with different targets cross at a right angle, break one of them with a small gap, a hop, so that readers see they don't connect.
   - Choose which one by a fixed rule, so that the output stays deterministic.
   - Store the Edge's stroke as separate pieces between hops.
10. **Corners.**
    - Round every corner with a small arc. Its radius is at most half the length of either run that meets there.
    - The SVG writer emits real arc commands, not sampled points.
11. **Fallback.** When the search finds no route, draw a simple one and report a warning.
    - If the target lies ahead of the source along the direction: run straight, make one jog halfway between the Ports, and continue.
    - Otherwise: step out of the source Port, move to a lane beyond both Nodes, travel back past them, and enter the target from its input side.

**Performance**

- The grid has O(n) lines per axis and O(n²) vertices, and each Edge is one A\* search.
- That is fine for a few hundred Nodes. Measure it with the benchmark fixture.

**Arithmetic**

- Geometry uses only arithmetic that gives the same result in every JavaScript engine: addition, subtraction, multiplication, division, square root, rounding, min and max.
- No trigonometry and no logarithms.
- That way, a scene computed in a browser would match one computed in Node.

### The scene

The scene is the laid-out, routed Diagram as plain data.

- It is independent of SVG, so that another renderer could be added later.
- It is exported for tests and for future renderers.
- It isn't a versioned format; only the JSON model is.

It holds:

- the bounds of the drawing;
- for each Group: its id, Kind, box, label box and depth;
- for each Node:
  - its id, Kind and bounds;
  - its Ports, each with its side and stub;
  - each piece of its text, with its position and measured width, and whether it was shortened;
- for each Edge:
  - its id, Kind and two Ports;
  - its route, as pieces of orthogonal polyline between hops, with their corner radii;
  - its label box;
  - whether it fell back to the simple route;
- the diagnostics that layout and routing raised.

### Static SVG

The SVG writer turns a scene into one self-contained SVG, committed next to its source as `<name>.diagram.svg` (ADR-0004).

**Self-contained**

- The SVG has no external references.
- It embeds only the glyphs of the bundled font that the Diagram uses, roughly 10–30 KB per file. The Node side builds that subset, either with a permissively licensed subsetting library or with our own small TrueType subsetter.
- Once an SVG is inlined into a page, its styles and font face apply to the whole page. So:
  - the font face gets a family name unique to that SVG, derived from its contents;
  - every selector in the SVG's style is scoped to that SVG.

**Model and hooks**

- The SVG carries its JSON model in a `<metadata>` element, so the SVG alone is enough for the web component to make it explorable.
- Every Node, Group and Edge is drawn in its own `<g>`, which carries its id and Kind as data attributes. An Edge's `<g>` also carries its two ends.

**Look**

- **Nodes.**
  - Each Node shows its Kind's outline, badge and hue.
  - Its header holds its Technology logo and its title.
  - Its Rows sit below, each with its name on the left and its value on the right.
- **Status** shows twice: as a color, and as a mark with a different shape for each status, such as a dot, triangle, cross and square. Color is never the only signal.
- **Callouts.** A callout draws a highlighted outline and a short tag above its Node.
- **Edges.**
  - An Edge is drawn as a body inside a darker casing, so that it reads clearly where it passes over other Edges.
  - Small chevrons at a fixed spacing show its direction, except on symmetric Edges.
  - Its end markers and role tags sit at its ends.
  - Where one Port feeds two or more Edges, a small junction mark sits over the split.
- **Groups.** A Group's box shows its title in its label band.

**Theme**

- Colors come from semantic CSS custom properties prefixed `--diagram-`:
  - `background`, `surface`, `border`, `ink` and `muted`;
  - `accent`, `ok`, `warn` and `danger`;
  - one hue for each family of Kinds.
- Every use of a property has a fallback value.
- A `prefers-color-scheme: dark` rule repeats those uses with dark fallbacks.
- A page that defines the properties wins in both themes. A standalone SVG follows the viewer's theme, including on GitHub.

**Animation** (slice 4)

- Flow marks move along each architecture Edge, using CSS keyframes.
- Their speed and their number grow with the logarithm of the Edge's rate, up to a cap. Edges with no rate move slowly.
- A `prefers-reduced-motion: reduce` rule stops all of it.
- Walkthroughs don't play in the static SVG.

**Accessibility**

- The root element has `role="img"`.
- A `<title>` holds the Diagram's title.
- A `<desc>` lists its Nodes, and its Edges in their sentence forms.

**Determinism**

The same model gives a byte-identical file on every machine, because:

- elements are written in model order, and attributes in a fixed order;
- numbers are rounded to at most two decimals, with no negative zero;
- ids derive only from model ids;
- lines end with LF, and the file ends with a newline;
- the font subset has a fixed table order and fixed timestamps.

### Lint

`diagrams lint` runs every check on the whole Atlas.

- **Pass or fail.** Errors make it fail; warnings don't.
- **Messages.** Each message names its rule and its file, and the line that declared the thing where that's known.
- **Speed.** If checking every SVG gets slow, cache renders by a hash of the model and the engine version, in a cache folder that git ignores.

**Errors**

On top of the model's own rules, these are errors:

- a module that fails to load, or doesn't default-export a Diagram;
- an id with two Kinds, or two titles, across the Atlas;
- a Link that points at an id, glossary term, file or heading that doesn't exist;
- a member of a `context` Group whose full id belongs to a different context;
- a `*.diagram.svg` that is missing, differs from a fresh render, or has no source left.

**Warnings**

- A title, Row or label uses a word that its context's glossary lists under _Avoid_. The message names the term to use instead.
- A text was shortened, or contains characters that the bundled font lacks.
- An Edge fell back to the simple route, or its label couldn't be placed clear of everything else.
- An id from another context, such as `ordering/order-placed`, isn't drawn inside its own context on any Diagram.

**Output**

- By default, one line per message: `file:line:column: severity: message (rule)`.
- With `--json`, JSON, for agents.

### CLI

**`diagrams render [paths…]`**

- Writes each `<name>.diagram.svg` next to its source.
- With no paths, it renders the whole Atlas.
- A Diagram with errors gets no new SVG: its errors are printed, and the exit code is 1.

**`diagrams lint [--json]`**

- Exits with 1 if there's any error, and with 0 otherwise.

**`diagrams export <diagram> --format png|json [--theme light|dark] [--scale n] [--out path]`**

- Writes a PNG, or the JSON model, and prints its path.
- By default, the file goes into a cache folder that git ignores. PNGs are for looking at, and are never committed.
- The PNG is drawn from the same SVG:
  - with the theme properties resolved to the chosen theme's colors;
  - with the bundled font handed straight to the rasterizer;
  - without animation.
- `diagrams export --index` writes the Atlas index.

**`diagrams dev [diagram]`**

- Starts the live preview.

### Live preview

- **Pages.** `diagrams dev` serves, on localhost:
  - a page that lists the Atlas's Diagrams;
  - a page for each Diagram, showing it in the web component.

  It uses only Node's built-in HTTP server.
- **Watching.** It watches the diagram modules, the modules they import, the config and the glossaries.
- **Rebuilding.** After a change, it:
  1. rebuilds the affected Diagrams in a fresh module context, so that edited imports are picked up;
  2. rewrites their SVGs on disk;
  3. pushes the new SVGs and diagnostics to open pages, using server-sent events.
- **Newest build wins.** If files change during a build, that build's result is dropped and the next build starts.
- **Errors** show in an overlay that names the file and line, while the last good drawing stays on screen.
- **Atlas index.** The page passes the Atlas index to the web component, so the list of other Diagrams an id appears on, and term definitions, work in the preview.

### Web component

**Overview**

- `<platform-diagram>` is a custom element that needs no framework (ADR-0002).
- It never lays anything out or routes it. It works from an engine-made SVG, given either:
  - as an inline child, which the page shows even before any script runs;
  - or as a `src` URL.
- The host page may give it:
  - the Atlas index;
  - a function that turns a Link or a Diagram id into a URL;
  - a motion setting.
- It reports selection and navigation as DOM events, so the host decides what navigating means.

**Camera**

- Dragging on empty space pans.
- Pinching zooms and pans.
- The mouse wheel zooms around the cursor when the Diagram has focus, or when a modifier key is held. Otherwise it scrolls the page.
- A press becomes a drag only after it has moved a few pixels, so a click stays a click.
- Zoom is kept within limits.
- Fitting:
  - frames the drawing with some padding;
  - never zooms out so far that text is unreadable;
  - on a narrow screen, starts at the side where the sources are.

**Focus**

- Hovering over or selecting a Node keeps it at full strength, along with everything upstream and downstream of it, and fades the rest. In architecture, that shows its blast radius.
- Symmetric Edges count in both directions.
- Hovering over an Edge highlights it, and shows its label (in full, if it was shortened), its Technology and its rate.
- Escape clears the focus.

**Details**

- Clicking a Node, or pressing Enter on it, opens its details:
  - its Kind, Technology, External flag and status;
  - its Rows and description;
  - its Links;
  - the other Diagrams that draw its id.
- Clicking a Group's label opens its details the same way.
- A Node whose id is drawn as a Group on another Diagram offers to open that Diagram. That's drill-down.
- Hovering over a Node that has a glossary-term Link shows the term's definition.

**Keyboard**

- Tab moves focus into the Diagram.
- The arrow keys move the selection to the nearest Node in that direction. Score each candidate by its distance ahead, plus a heavier penalty for its distance to the side.
- Enter opens details, and Escape closes them.
- `+`, `−` and `0` zoom in, zoom out and fit.

**Screen readers**

- Alongside the drawing, the component renders, for assistive technology:
  - a list of the Nodes, each with its Kind, title, Technology and Rows;
  - the Edges in their sentence forms, such as "Checkout API calls Payments API over gRPC: authorize".
- Both lists follow layout order.
- Focusing an item selects it in the drawing.

**Level of detail**

- As the view zooms out, Rows fade and then disappear, leaving only the headers.
- Further out, the flow marks disappear too.

**Transitions**

When the component receives a new SVG of the same Diagram, as in the live preview:

- Nodes and Groups glide from their old places to their new ones, matched by id.
- During the glide, each old route bends to follow its ends: each point moves by a blend of its two ends' displacements, weighted by how far along the route it lies.
- At the end, the routes cross-fade into the new ones.
- New things fade in, and removed things fade out.

**Walkthroughs** (slice 4)

- A Diagram's Walkthroughs are listed by title.
- Playing one shows its Steps one at a time. Each Step:
  - highlights its Edges, or its Node, and fades the rest;
  - sends a mark along each highlighted Edge, starting from the `to` end when the Step runs that Edge back;
  - shows the Step's note.
- The controls are play and pause, previous and next, and the current Step's number.
- While a Walkthrough is open, the arrow keys step through it, and Escape leaves it.

**Motion**

- All animation stops when `prefers-reduced-motion` asks for it, or when the host turns motion off. Changes then happen instantly.

**Styling**

- The component takes its colors from the same CSS custom properties as the SVG.
- If it uses a shadow root, it declares the SVG's font face on the document instead. Some browsers ignore font faces declared inside shadow roots.

**Cost**

- The component skips flow animation for Edges outside the view.
- It pauses animation entirely while it is off screen.

### Agent skill

- A short skill that teaches agents to:
  1. decide when a Diagram helps, and which Notation fits;
  2. write a diagram module with the authoring API, from one small example per form of Diagram;
  3. choose Kinds, ids and namespaces;
  4. add Rows, Links to glossary terms, ADRs and specs, and Walkthroughs;
  5. run `diagrams render` and `diagrams lint --json`, and fix what lint reports;
  6. export a PNG and look at it before finishing;
  7. commit the source and its SVG together.
- It stays short.
- It is updated in each slice that adds to the API: the domain Notation in slice 2, and Walkthroughs in slice 4.

### Docs site

- **What it shows.**
  - The site is built with Starlight, in the docs app.
  - It shows the glossaries, ADRs, specs and docs from where they live in the repo. Nothing is copied into the site by hand.
- **Diagrams.**
  - Docs embed Diagrams with plain Markdown image syntax, so the same file works on GitHub.
  - On the site, every image of a `*.diagram.svg` becomes a `<platform-diagram>` with the SVG inline.
  - Without JavaScript, the drawing still shows.
- **Links.** The site builds the Atlas index at build time, and turns Links into site URLs:
  - glossary terms into their entries;
  - ADRs and specs into their pages and headings;
  - ids into the Diagrams that draw them.
- **Node URLs.** A URL can point at one Node on a Diagram. Opening that URL selects the Node.
- **Theme.**
  - The site defines the `--diagram-` properties for its own light and dark themes.
  - So Diagrams follow the site's theme switch, which may differ from the system's setting.

## Testing Decisions

**What makes a good test**

- A good test checks only external behavior:
  - what goes in at a seam: a Diagram, a folder of files, a click or a key press;
  - what comes out: diagnostics, scene geometry, SVG bytes, files, exit codes, and what a reader sees on the page.
- It doesn't call internal functions, mock internal modules, or look at private data.
- Most checks are properties over fixed fixtures, such as "no route passes through a Node", rather than exact coordinates. Properties survive changes to the algorithms.

**Prior art**

The repo has no code or tests yet, so these tests become the prior art. The user agreed on three seams.

### Seam 1: the core, in memory

- **Input.** A Diagram built with the authoring API, or JSON for the validation cases.
- **Output.** Diagnostics, the scene and the SVG.
- **Font data.** A small test helper reads the bundled font and passes it in.
- **Scope.** Most tests live here.

**Validation**

- One failing fixture per model rule, checking the rule and its message.

**Notations**

- Edge Kinds accept only the ends they allow.
- Roles are accepted only on the ends that allow them.
- A domain Diagram can't mix the two forms.

**Layout properties**

- No two Nodes overlap, or enter each other's clearance.
- Every Group contains its members with padding, and sits inside its parent.
- Along the direction, every Edge's target ranks after its source, except for Edges that close a cycle.
- Declaration order decides ties.
- `down` swaps the axes.

**Routing properties**

- Every segment is horizontal or vertical.
- No route passes through a Node or a Group label.
- Every Edge gets a route, and every fallback is reported.
- Two Edges in different bundles never share a stretch of lane.
- Parallel Edges stay apart along their whole length.
- A self-loop routes around its Node.
- Hops appear only where Edges with different targets cross.
- No corner radius exceeds half of a run next to it.
- Labels don't overlap Nodes, Group labels or each other.

**SVG**

- Golden files for a few representative fixtures: one per form of Diagram, plus the crowded fixture.
  - They change only through an explicit update command.
  - So every visual change shows up in review.
- Rendering twice gives identical bytes. So does rendering an equal model that was built another way.
- No external references.
- The embedded font holds exactly the glyphs that are used.
- The metadata parses back to the model.

**Types**

- Vitest's type tests check that each of these fails to typecheck:
  - a wrong Kind, Edge Kind, role or status;
  - the name of a Row that doesn't exist.

**Speed**

- A crowded fixture lays out and routes under a generous time limit, which is enough to catch a blow-up. The fixture has:
  - about 60 Nodes and 150 Edges;
  - a wide fan-out squeezed through one corridor;
  - several nested Groups.
- A separate benchmark tracks the actual time.

### Seam 2: the CLI on a sample Atlas

- **Setup.** Each test writes a small Atlas into a temporary folder:
  - a config;
  - diagram modules;
  - glossaries;
  - a doc or two;
  - SVGs, where needed.
- **Running.** The test runs the CLI function in-process, with arguments and a working directory, and captures its output and its exit code.
- **Smoke test.** One test runs the real binary.

**render and lint**

- `render` writes SVGs next to their sources, and `lint` passes afterwards.
- Each Atlas check fails when it should:
  - an id with two Kinds, or two titles;
  - a broken Link, of each sort;
  - a missing, out-of-date or orphaned SVG;
  - a word the glossary avoids, as a warning that suggests the right term.
- Exit codes are right.
- `--json` output is right.

**export**

- `export` writes a PNG of the expected size, checked from its header rather than its pixels.
- `export --index` writes the Atlas index.

**dev**

- Start it on a free port and subscribe to its event stream.
- Edit a module, then a module it imports: a new SVG arrives each time.
- Break a module: an error naming the file and line arrives.
- Change files quickly: only the newest result arrives.

### Seam 3: the web component in a real browser

- **Browser.** Vitest browser mode, with Playwright's Chromium, as dev dependencies only.
- **Fixtures.** SVGs made by the core during test setup.
- **Driving.** Tests use real pointer and keyboard events.
- **Checking.** Tests check what a reader perceives:
  - visible text;
  - focus;
  - ARIA state;
  - computed opacity.

  They never check internal class names.

**Cases**

- Focus highlights exactly the Node, everything upstream and downstream of it, and fades the rest. Escape clears it.
- Details show the right content.
- Drill-down and Links raise navigation events with the right targets.
- The arrow keys move to the expected Node, and Enter opens its details.
- The screen-reader list matches the Diagram.
- Walkthroughs:
  - step forward and back;
  - highlight the right Edges;
  - run back Steps in reverse;
  - show their notes.
- With reduced motion emulated, no animations run: `document.getAnimations()` is empty.
- After a transition to a new SVG:
  - every Node sits where the new SVG puts it;
  - removed Nodes are gone.
- Fit shows the whole drawing, and zoom stays within its limits.

### Docs site

- One check: build the site with a sample page, and confirm that the page's Diagram image became the web component, with the SVG inline.

## Out of Scope

v1 leaves out the following. Each later feature gets its own design session before it's built.

- **The data model Notation**: entities with fields, Edges from field to field, and crow's-foot cardinality markers. The core's Row Ports are already ready for it.
- **Plans and event storming**, which need a timeline layout.
- **Collapsing and expanding Groups.** In v1, drill-down covers that need.
- **Live data.** Rates and statuses come only from the source.
- **The editor**: dragging Nodes, drawing Edges, writing changes back to the source, and pinning positions.
- **Typed Links between Notations**, such as "implemented by". v1 has plain Links.
- **A text syntax like Mermaid's or D2's.** It may come later, compiled to the same JSON model.
- **A shared model with views, as in Structurizr.** In v1, ids are shared but each Diagram stands alone.
- **Shapes the model forbids**: Edges that end at Groups, Groups that overlap, and Nodes in two Groups.
- **Other renderers**: Canvas or WebGL.
- **Other features**: sequence diagrams, freehand drawing, live collaboration, and a diff view between versions of a Diagram.
- **Walkthroughs in the static SVG.**
- **Release work**: publishing the package, choosing its license, and CI.

## Further Notes

### Decisions made while writing this spec

These decisions go beyond what the design session settled. Change any that prove wrong, here and in the code.

1. **Layout has no memory of earlier layouts.**
   - The design session said that each live-preview layout starts from the previous one.
   - But the preview would then differ from the committed SVG, which lint requires to match a fresh render.
   - So layout is a pure function of the source, kept stable by letting declaration order settle every tie. The preview animates from the old drawing to the new one instead.
2. **The SVG is the component's input.** Each SVG carries its own JSON model, and the web component works only from engine-made SVGs. In v1, layout runs only in Node.
3. **Edge ids.** Edges get default ids from their two ends. Parallel Edges need explicit ids.
4. **Bundling.** Edges bundle only with Edges of the same Kind, and parallel Edges never share a lane.
5. **Names.**
   - The config file is `diagrams.config.ts`.
   - The web component is `<platform-diagram>`.
   - The CLI commands are `render`, `lint`, `export` and `dev`.
   - The CSS properties are prefixed `--diagram-`.
6. **Values.** Statuses are `ok`, `degraded`, `down` and `unknown`. Rates are written like `2k/s`.
7. **Diagram ids.** A Diagram's id is its path from the repo root.
8. **Strict lint.** A title that differs between Diagrams is an error, and so is an SVG without a source.
9. **`diagrams dev` writes files.** It rewrites SVGs on disk after each successful rebuild.
10. **Licenses.** Dependencies must be permissively licensed. MPL-2.0 is allowed only for unmodified dependencies of the CLI.
11. **Assets.** Inter is the font, and Simple Icons supplies the Technology logos.
12. **Kept from the earlier draft**: flagging Edges that cross between regions or zones, and callouts.
13. **Domain Edges** get no flow animation.

### Risks to check early

- **Fonts on GitHub.**
  - GitHub serves repository files under a strict Content-Security-Policy. That policy may stop an SVG shown in Markdown from using its embedded font, and the text then falls back to the font stack in the SVG's style.
  - Check this as soon as the repo has a GitHub remote.
  - Until then, keep that fallback stack to fonts no wider than Inter, such as Helvetica and Arial, so that shortened text still fits.
  - Also check that CSS animation plays in an SVG on GitHub.
- **Type stripping.**
  - Node's type stripping handles only erasable syntax, and won't strip files under `node_modules`.
  - If either limit blocks something, add a bundler to the CLI.

### Notes for later features

These ideas from the earlier draft aren't needed in v1. They're kept so that later work doesn't start from nothing.

**Placement, for the editor**

- Positions snap to the grid.
- When a Node is dropped where it would break another Node's clearance, it moves to the nearest free spot.
  - That spot always lines up, on each axis, with either the wanted position or the clearance edge of another Node.
  - So the candidates are, on x, the wanted x and each Node's left and right clearance edges, and on y, the same.
  - Test every pair, and keep the cheapest free one.
  - Make a sideways move cost several times as much as a vertical one, so that a Node stays in the column it was dropped in.
- A multi-selection is placed as one bounding box, and its members keep their offsets within it.
- During a drag, outline the spot where the Node will land.

**Routing while editing**

- Route in a Web Worker, with one request in flight. When it answers, send only the newest layout requested since then.
- While a Node moves near where its routes were last computed, bend those routes to follow it, as in transitions. When it moves further away, use the fallback route.
- Swap in the new routes when they arrive.
- Route a dragged Node's Edges to the spot where it will land.

**Editing gestures**

- **Selection.**
  - A click selects, and shift-click adds or removes.
  - Shift-dragging on empty space selects by box, and modifier keys choose whether the box replaces, adds to, or subtracts from the selection.
  - A multi-selection shows a frame with corner handles.
- **Dragging.**
  - A picked-up Node lifts: its shadow deepens and it grows slightly.
  - It snaps to the grid as it moves, and glides into place when dropped.
  - For easing that doesn't depend on the frame rate, move each frame by the share 1 − e^(−rate × dt) of the remaining distance.
- **Placing.**
  - A new Node shows as a translucent preview under the pointer.
  - Saved templates can be placed the same way, with any parts that can't be placed marked.
- **Connecting.**
  - Drag from an output Port. The loose end snaps to a target, which lights up.
  - If the drag ends over nothing, the end pulls back into its Port.
  - A new Edge draws itself out from its Port, and a removed Edge fades away.
- **Deleting.** Delete or Backspace removes the selected Edge, unless a text field has focus.
- **Touch.** Coarse pointers get larger hit areas.
- **Ownership.**
  - The host owns the model. The editor reports intents: a Node moved, an Edge was requested or removed, the selection changed.
  - A moved Node keeps its new position until the host confirms the move, and returns after a short wait if the host refuses it.

**Layout**

- Network simplex ranking (Gansner 1993), for shorter Edges.
- Better coordinate assignment.
- Letting an Edge that leaves a Group pull its inside end toward the side it leaves from.

**Large Diagrams**

If a Diagram ever needs thousands of Nodes:

- redraw only the layers whose inputs changed;
- keep fast-changing animation in a layer of its own;
- draw identical moving marks as instances;
- or add a canvas renderer for the same scene.

**Plans**

- The critical path, the longest chain of work by duration, shown as a callout.

### Decisions made during implementation

Implementers add decisions here as they make them. Change any that prove wrong, here and in the code.

**Ticket 01**

1. **Diagram ids come from the Atlas.**
   - A diagram module leaves `id` out, so the model's `id` is optional. The Atlas sets it to the module's path.
   - Ticket 05 does that, since nothing reads a Diagram's id before the Atlas index.
   - The builder takes an `id` only for Diagrams built outside the Atlas, such as test fixtures.
2. **The authoring API.**
   - `architecture({ title }, (d) => { … })` builds a Diagram.
   - `d.node({ id, kind, title })` takes a plain object, so a shared definition can be passed straight in. It returns a handle.
   - `d.edge(from, to, { kind, id? })` takes handles or ids. An Edge's Kind has no default.
   - The builder always writes `direction` and all five lists, even empty ones. Validation requires the lists.
3. **Edge ends** are plain Node ids in the model. Ticket 08 adds a form that names a Row.
4. **Ids.**
   - A Node id is lowercase kebab-case words, digits allowed, optionally namespaced with `/`.
   - An Edge id is the same, or two ids joined by `->`, which is the default form.
   - Edge ids only need to be unique among Edges.
5. **Diagnostics.**
   - Each one has a severity, a rule, a message, and a JSON Pointer into the model.
   - Rules so far: `model-shape`, `model-version`, `unknown-notation`, `unknown-kind`, `duplicate-id`, `id-format`, `edge-end`, `module-load`, `svg-missing` and `svg-out-of-date`.
   - Until ticket 05 adds lines, the CLI prints `file: severity: message (rule)` on stdout, with paths relative to the working directory.
6. **Loading modules.** Each CLI run imports the diagram modules in a fresh worker thread, through Node's type stripping. So edits to a module, or to anything it imports, are always picked up, even when a test runs the CLI in-process.
7. **The repo root, until ticket 05.**
   - It's the nearest folder at or above the working directory that holds `.git`, or else the working directory.
   - Discovery skips `.git` and `node_modules` at any depth, and `repos/` only at the root.
8. **The cache folder** is `.diagrams-cache/`, at the repo root.
9. **CLI output.**
   - `render` prints `Wrote <path>` for each SVG whose bytes changed, and leaves the others alone.
   - `lint` ends with a summary line.
   - An unknown command prints the usage and exits with 2.
10. **Golden files.**
    - They live in `packages/diagrams/test/golden/`, named `*.svg` rather than `*.diagram.svg`, so the Atlas never takes them for Diagram SVGs.
    - A small helper compares them byte for byte. Only `pnpm golden:update` changes them.
11. **SVG hooks.** A Node's `<g>` carries `data-node` and `data-kind`. An Edge's carries `data-edge`, `data-kind`, `data-from` and `data-to`. Edges are drawn beneath Nodes.
12. **Tooling.**
    - Biome keeps its defaults, with lines of 100. It also rejects syntax that isn't erasable, and rejects Node's modules in the authoring API, the Notations and the core.
    - Biome skips generated SVGs, since it now lints SVG files.
    - pnpm 12 blocks dependencies' build scripts. So lefthook's postinstall is denied, and the root `prepare` script installs the hook instead.
13. **Licenses.**
    - Every dependency is MIT, ISC, BSD or Apache-2.0, except lightningcss (MPL-2.0), which Vite pulls in for Vitest.
    - It's dev-only, unmodified and never shipped, so it gets the same allowance as an MPL-2.0 dependency of the CLI.

**Ticket 02**

1. **Direction in the builder.** `architecture({ title, direction: "down" }, …)` chooses `down`. The default stays `right`, and the builder always writes `direction`.
2. **The scene states its spacing.** It carries `clearance` (32 px) and `grid` (8 px), so that tests, the router and, later, the editor read them instead of repeating constants.
3. **A layout of one level.**
   - The ranks, order and coordinates of one level live in a module of their own, which ticket 06 can run once per Group.
   - It takes members, measured along and across the ranks, and the connections between them. It works with the rank axis as x, and `down` turns its result.
4. **Declaration order** is the order of the Diagram's `nodes`, until ticket 06 brings levels and `members`.
5. **Placeholders.**
   - In each rank, placeholders start after the Nodes, in the order of their Edges.
   - A placeholder has no size, and keeps the clearance from its neighbors, as a Node does.
6. **Order.**
   - There are eight sweeps, alternating forward and backward and starting forward. They stop early at zero crossings.
   - A member with no neighbors in the rank before keeps its place in a sweep.
   - Crossings are counted between neighboring ranks, placeholders included, and parallel Edges count once there too.
   - Edges that close a cycle take no part in ordering or alignment either. The router takes them around.
7. **Alignment.**
   - Layout keeps Brandes and Köpf's four alignments, each packed as tightly as the order and the clearance allow, but doesn't balance them. The one that leaves the fewest segments bent wins, then the one whose bends are shortest in total, then the first of up-left, up-right, down-left and down-right.
   - Balancing often puts a Node between two neighbors, so that neither Edge runs straight. Picking one alignment keeps it level with one of them, and still centers a fan of three on its middle Node.
   - The paper's marking of segments that cross a segment between two placeholders is left out, since no test can see it while no router follows placeholders.
   - Each block goes as near the start of its rank as the blocks before it allow, instead of the paper's classes and shifts.
8. **The grid** is 8 px.
   - Separations within a rank, and the lines of the ranks, round up to whole steps of it, so that the clearance and the order survive snapping.
   - Node sizes are multiples of 16 px, twice the grid, so that a Node centered on a grid line has its corners on the grid too. Tickets 07 and 08 should keep to that.
9. **Spacing.** The clearance is 32 px, the gap between ranks a fixed 96 px, and the margin 24 px.
10. **Header Ports for `down`** sit at the middle of the top and bottom sides.
11. **Arithmetic.**
    - A Biome GritQL plugin, `packages/diagrams/biome/exact-arithmetic.grit`, allows only Math's `abs`, `ceil`, `floor`, `max`, `min`, `round`, `sign`, `sqrt` and `trunc` in the core. It rejects `**`, `**=` and destructuring Math.
    - It covers the whole core, routing included.

**Ticket 03**

1. **Stubs.** A stub is half a clearance long, 16 px, so it ends on the grid line beside its side. Of the two lines through a stub's end, the one across the stub is that line, and the one along the stub is new.
2. **The grid.**
   - The outer lines run one clearance outside the Nodes' bounds.
   - A segment is open only if it misses every Node, border included, so no route runs along a Node's side. A crossing inside a Node, or on its border, has no open segment, so no route can reach it.
3. **The search.**
   - A bend costs 40. A corner's radius is at most 8.
   - A search may visit 1,000,000 states. `render(diagram, { searchBudget })` changes that, which is how tests force the fallback.
   - A search keeps its working memory in typed arrays sized to the grid, allocated once per Diagram.
   - On a synthetic Diagram of 300 Nodes and 750 random Edges, rendering took about 3 s. The longest search visited about 200,000 states, in 45 ms. Most of the time goes to Edges that run against the direction and go around long columns of Nodes.
   - The search runs backward, from the target's stub to the source's. When two states have the same estimate, it takes the one whose path has come further, and then the one queued first, with steps queued east, south, west, north.
   - Together, those choices find, among routes that cost the same, the one that bends nearest its source. So Edges from one Port fork just past its stub, and Edges into one Port merge into a trunk before it. For bundling (ticket 09), a later Edge can start its search anywhere on the trunk, instead of ending it there.
   - Edges are routed in order of id. Ticket 09 sorts by bundle key first.
4. **The fallback.**
   - The target lies ahead when its stub ends at or beyond the source's stub, along the direction.
   - Otherwise, the lane runs half a clearance beyond both Nodes, on whichever side needs less travel across the direction. On a tie, it runs below them for `right`, and to their right for `down`.
   - The rule is `fallback-route`. It's a warning, and points at the Edge.
5. **The scene.**
   - A Port has a `stub`: the far end of its stub.
   - An Edge has `fromPort`, `toPort` and `fellBack`. Its route is a list of points, each with the `radius` of its corner, which is zero at both ends.
6. **The SVG** draws each corner as an `A` command, from where its arc meets the run before it to where it meets the run after. The sign of the turn's cross product gives the sweep flag, so no trigonometry is needed.
7. **The jog** in step 7 waits for ticket 09. Until runs are offset into lanes, a stub always meets its first run at its own height.

**Ticket 04**

1. **The bundled font.** `packages/diagrams/fonts/` holds `Inter-Regular.ttf` and `Inter-SemiBold.ttf` from `extras/ttf/` in Inter 4.1's release zip, with Inter's `LICENSE.txt` beside them as `OFL.txt`. A test pins their SHA-256s.
2. **Metrics.**
   - `pnpm generate:font-metrics` runs `packages/diagrams/scripts/generate-font-metrics.ts`, which writes `src/core/font-metrics.ts`. A test runs it twice, and compares both outputs with the committed file.
   - For each weight, the file holds the units per em, the average width, and the advance width of every character in the font's character map, in rows of 16 code points.
   - A character the font lacks is measured at the font's own average width, `xAvgCharWidth` in its `OS/2` table.
3. **Titles.**
   - A title is Inter SemiBold at 14px, centered in its header, with at least 12px clear on each side. Until ticket 07, the header is the whole Node.
   - Before measuring, each run of spaces, tabs and line breaks becomes one space, and spaces at either end go. Renderers don't all collapse white space alike, so the SVG gets it already collapsed.
   - A title too wide keeps the longest start that fits with `…` (U+2026) after it. It's cut between code points, and spaces before the ellipsis are left out.
   - Each piece of text in the scene records its drawn text, measured width, weight, size, and whether it was shortened.
4. **Warnings.** The rules are `text-shortened` and `glyph-missing`. Both name the Node and point at its title. `glyph-missing` lists each character with its code point.
5. **Font data.**
   - `render(diagram, { fontData })` calls `fontData({ weight, characters })` once for each weight the SVG draws text in. `characters` holds every character drawn in that weight that the font has, once each, in code point order. The function returns a TrueType font.
   - Without `fontData`, the SVG embeds no font. The Atlas always passes the bundled font's subsetter. Tests that check only the scene or diagnostics leave it out.
6. **The subsetter** is our own, `src/fonts/subset.ts`, written from the OpenType specification.
   - It keeps `.notdef`, the characters' glyphs and their components, numbered in the font's own order.
   - It writes only `OS/2`, `cmap`, `glyf`, `head`, `hhea`, `hmtx`, `loca`, `maxp`, `name` and `post`, in tag order.
   - It leaves out the hinting (`fpgm`, `prep`, `cvt `, `gasp` and each glyph's instructions) and the layout tables (`GDEF`, `GPOS` and `GSUB`). So the subset can't kern or form ligatures, whatever a renderer does.
   - `post` is version 3, without glyph names. `name` drops the names of the stylistic sets that `GSUB` held, which are IDs 256 and up. `loca` is long, and `head` keeps the font's own timestamps.
   - `cmap` has a format 4 subtable under (0,3) and (3,1), and also a format 12 subtable under (0,4) and (3,10) when a character lies beyond the Basic Multilingual Plane.
7. **Family name and scope.**
   - Both are `diagram-` and a 64-bit FNV-1a hash, in hex, of the SVG's size, its font data, the rules that color it (since ticket 07) and the rest of its body.
   - The root `<svg>` carries that name as a class, and the style's one rule selects that class. Text inherits the font stack, and kerning and ligatures turned off, from the root.
   - One family has one face per weight, with `font-weight` 400 or 600. The data URL's type is `font/ttf`.
8. **The fallback stack** is `"<family>", Helvetica, Arial`, with no generic family at the end, since that could be a wider font.
   - Measured in Chrome over Basic Latin and Latin-1, Helvetica and Arial set text at 0.96 of Inter's width in regular, and 0.97 in bold.
   - Some characters are wider than Inter's, though: `1` by about a third, `_` and `^` by a fifth, and capitals such as `E` and `R` by up to 12%. So all-caps text comes out up to 1% wider than Inter.
   - A title's 12px of clearance on each side absorbs that.
9. **Size.** The example Diagram's subset is 4.1 KB, or 5.4 KB in base64. That's under the 10–30 KB estimate, because it has no hinting, glyph names or layout tables. A test keeps it under 30 KB.
10. **Tests read fonts with their own code.** `test/support/truetype.ts` is a TrueType reader written separately from the engine's, so that tests don't trust the code under test. It reads both of the bundled font's Unicode subtables, where the engine reads only the format 12 one.
11. **Exact arithmetic.** Ticket 02's Biome plugin rejects `**` throughout the core, even between BigInts, which are exact. So the hash's modulus, 2⁶⁴, is written `1n << 64n`.

**Ticket 05**

1. **The config and the root.** This replaces ticket 01's decision 7.
   - `diagrams.config.ts` default-exports `atlas({})`. Its type takes no settings yet, so slice 2 can add `contexts` without breaking any config.
   - The repo root is the nearest folder at or above the working directory that holds the config. Without one, `render` and `lint` exit with 2 and show how to write it.
   - Only `lint` loads the config, since `render` doesn't need its contents. A config that fails to load, or doesn't default-export an object, is a `module-load` error.
2. **Discovery.**
   - With a `.git` at or above the root, the Atlas's files are what `git ls-files --cached --others --exclude-standard` lists under the root, minus files that were deleted but are still tracked.
   - Git runs without `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE`, so that it reads the repo that holds the root, even inside a hook. If git fails, the command exits with 2. It never falls back to the walk, which would bring in ignored folders.
   - Outside git, the walk skips folders named `.git` and `node_modules`. `repos/` has no rule of its own any more, since git ignores it.
   - Files come in path order, folder by folder, however they were found.
3. **Declaration positions.**
   - The builder finds each declaration's caller with `Error.captureStackTrace`. It's a V8 API, not a Node module, so the core may use it. Engines without it record nothing.
   - The positions sit beside the model, never in it: a non-enumerable property under `Symbol.for("@the-platform/diagrams/declarations")`, keyed by JSON Pointer (`""` for the Diagram, `/nodes/2`, `/edges/0`). JSON and `toEqual` both ignore it.
   - A diagnostic goes to the nearest declaration at or above its pointer. A shared Node is placed at the `d.node(…)` call on each Diagram. A declaration made inside a helper function is placed in the helper.
   - The column is where V8 puts it: at `node` in `d.node(`.
4. **Load failures.**
   - A module that throws is placed at the first frame of the stack that lies in that module.
   - A syntax error gets its line from the first line of the stack, and no column. Node shows the column only in a snippet, and expands tabs in it.
   - When the error came from a module that it imports, the message stays on the diagram module and names the other place as a repo path, as in `The module failed to load: docs/shared/nodes.ts:3:7: No API today.`
5. **Output.** This replaces the output of ticket 01's decision 5.
   - A message about a whole file, such as an SVG, prints as `file: severity: message (rule)`, with no line and no column.
   - Messages come file by file in path order, then by line and column. Paths inside a message are repo paths. Each message's own file is shown relative to the working directory, as before.
   - `--json` prints one object, `{ diagrams, errors, warnings, messages }`, indented by two spaces. Each message has `file`, `line`, `column`, `severity`, `rule`, `message` and `pointer`, leaving out what isn't known. `file` is relative to the working directory, as in the text, and no summary line is printed.
   - An unknown option exits with 2, like an unknown command.
6. **Diagram ids.** The Atlas sets each Diagram's `id` to its module's path from the repo root, minus `.diagram.ts`, replacing any id the module gave. Messages name other Diagrams by these ids.
7. **Links.**
   - A Link is `{ id, label? }` or `{ doc, section?, label? }`. The types forbid a Link with both, and validation checks it again as `model-shape`. A Link's id must be a kebab-case id (`id-format`). Until slice 2, a Link with a `term` fails validation too, as one without exactly one of `id` and `doc`.
   - A `doc` is a path from the repo root, and must name a file inside the repo. One that leaves the repo with `..` is broken, even if the file exists. Lint checks files on disk, not in git.
   - A `section` names a heading by its text or by its anchor. Both go through GitHub's anchor rules: links keep only their text, letters are lowercased, punctuation is dropped, each space becomes a hyphen, and a repeated anchor gets `-1`, `-2` and so on. Only ATX headings count, outside code fences.
   - A Link to an id resolves against the ids drawn on every Diagram that loaded, even one with errors, so that those errors don't also show as broken Links.
   - The builder takes `readonly Link[]`, so that an `as const` definition works, and copies each Link into the model.
8. **Ids across the Atlas.**
   - Every place that draws a conflicting id gets an error. It names the values that the other Diagrams give the id, and those Diagrams' ids.
   - Only Diagrams that pass validation take part.
   - Only `kind` and `title` must agree. Links, and later Technologies and Rows, may differ from Diagram to Diagram.
9. **Shared Nodes** are plain objects written with `satisfies ArchitectureNode`, which keeps the Kind's literal type.
10. **Orphans.** An SVG is orphaned when discovery finds no module beside it. An SVG that git ignores isn't in the Atlas, so it's never reported.
11. **Rules added:** `broken-link`, `kind-conflict`, `title-conflict` and `svg-orphaned`.

**Ticket 06**

1. **Declaring Groups.**
   - `d.group({ id, kind, title, description?, links? }, (g) => { … })` declares a Group. Its callback gets a builder whose Nodes and Groups join that Group.
   - Each builder adds to its own parent, whenever it's called: `d.node(…)` inside a Group's callback still declares a member of the Diagram. Edges belong to the Diagram, whichever builder declares them.
   - It returns a handle with the Group's id. An Edge end can't be a Group's handle, since it has no `row`, so ending an Edge at a Group is a type error as well as a validation error.
   - A Group is declared from a plain object, as a Node is. So one shared `{ id, kind: "system", title }`, written `satisfies ArchitectureNode`, can be a Node on one Diagram and a Group on another.
   - The builder records each Group's declaration under `/groups/<n>`, so diagnostics about a Group point at its `d.group(` call.
2. **Nesting.** The rule `nesting` covers four errors in generated JSON: a member that names no Node or Group on the Diagram; a Node or Group listed by two parents, or twice by one; one listed by none; and Groups that contain each other.
   - The Diagram's `members` are read first, then each Group's, in model order. The first list that names a member is its parent, and each later one is an error.
   - An id that names two things gets only `duplicate-id`, since its two listings are expected.
   - A cycle is reported once, at the first of its Groups in model order, pointing at the member that names the next Group in the cycle.
   - Node and Group ids share one namespace on a Diagram, so a Node and a Group with one id are a `duplicate-id` error. An Edge end that names a Group is an `edge-end` error that says so.
3. **Levels.** This replaces ticket 02's decision 4.
   - Declaration order on each level is that level's `members`.
   - At its parent's level, a Group's Ports' line is that of the Node inside it that the level's first connection to it joins, in Edge order. Without a connection, it's that of its first Node, and without a Node, halfway across. So a Node outside a Group lines up with the Node it calls inside.
   - A Node's block includes the room for its callout's tag, so the tag stays inside the Node's Group.
4. **A Group's box.**
   - The padding is one clearance, 32 px, at the sides and the bottom. The grid lines half a clearance outside the members then run down the middle of the padding.
   - The label band is 24 px high, and the members start a clearance below it, so no Node comes within a clearance of the label.
   - The box rounds up to whole steps of 16 px, growing to the right and down, so that a Group centered on a rank's line has its corners on the grid, as a Node does.
   - An empty Group keeps room for one 176 by 48 px Node.
   - The title is Inter SemiBold at 13 px, 12 px in from the box's left side, in the middle of the band. A title too wide for the box is shortened, with the usual `text-shortened` and `glyph-missing` warnings, at `/groups/<n>/title`.
5. **The label box.**
   - It's the part of the label band that the title fills, from the box's left side to 12 px past the title, rounded up to the 8 px grid. The scene calls it `label`.
   - Only the label box is an obstacle. The rest of the band stays open, so that an Edge can enter a Group from above, as most do on a `down` Diagram.
6. **The grid.**
   - Lines run half a clearance outside each label box, and each Group's box. The spec asks only for the first. The second completes the ring of lines inside each Group's padding where a nested Group is outermost, so a route can pass a Group without crossing its border.
   - The outer lines run a clearance outside every Node, tag and Group.
   - Lines are global, so a Node far from a Group can bring one level with the Group's border. That happens often: a Group's Ports' line is often 80 px below its top, as tall as a 48 px Node and a clearance, so a Node stacked above the one it lines up with has its Ports level with the Group's top. Every segment along a Group's border is closed, so no route runs along one.
7. **Crossing a border** costs 16, as much as 16 px of length. The grid counts the borders each segment crosses, and a border at a segment's far end counts for that segment, so a route that crosses at a vertex pays once.
   - The padding's ring of grid lines means that a route between two Nodes of one Group always has a way inside that's shorter than any way outside. So the geometry keeps such routes inside, not the cost.
   - The cost keeps routes out of Groups they only pass: where a route can turn beside a Group or inside its padding at the same length, it turns beside it.
8. **The scene.** A scene Group has `id`, `kind`, `box`, `label`, `depth` and `title`, in model order. `depth` is 0 for a Group on the Diagram itself.
9. **The SVG.**
   - Groups are drawn after the background and beneath the Edges, in model order, in a `<g class="diagram-groups">`. Each Group's `<g>` carries `data-group` and `data-kind`, and holds a rect of class `diagram-group` and a title of class `diagram-group-title`.
   - Boxes are stroked in `--diagram-border`, and titles drawn in `--diagram-muted`. A `system` is 2 px wide, a `region` 1.5 px, and a `zone` 1.5 px dashed 6 and 4. Corners round by 8 px.
10. **The Atlas.**
    - An id has one Kind and one title whether a Diagram draws it as a Node or as a Group. So a `system` Node and a `system` Group with one title agree.
    - A title conflict at a Group says to define the Group once, in a shared module.
    - A Group's Links resolve as a Node's do. A Link to an id resolves when any Diagram draws it, as a Node or as a Group.
11. **Rules added:** `nesting`.

**Ticket 07**

1. **Looks live in the Notation.**
   - `architectureNodeLooks` gives each Kind its size, its outline, its badge and its family. A badge is path data for a glyph 16 px square, drawn stroked.
   - `src/core/outlines.ts` draws each outline as path data, from addition, subtraction, multiplication and division only, so another renderer could use it.
   - Every stroke stays inside the Node's rectangle, and the outline meets the Node's sides wherever the Node has a Port.
2. **Sizes.** Every Kind is 176 by 48 px, except:
   - a queue, 192 px wide, since the pipe's open end takes 18 px;
   - a system, 208 by 64 px, to look heavier;
   - a person, 160 by 80 px: its head takes the top 32 px, above a header of 48.

   Each Row adds 32 px below the header, as in ticket 08.
3. **Outlines.** No two Kinds share an outline, and no two share a badge.
   - person: a head above rounded shoulders.
   - system: a 3 px border with a thin frame inside it.
   - client: a window with a title bar.
   - gateway: a hexagon, pointed at both ends.
   - service: a rectangle with rounded corners.
   - worker: two cards, one behind the other.
   - function: a rectangle with its corners cut off.
   - database: an upright cylinder.
   - cache: a memory chip, with pins along its top and bottom.
   - queue: a pipe on its side, open toward the right.
   - storage: a page with a folded corner.
   - search: a pill, like a search field.
4. **Outlines with Rows.** Below its pointed header, a gateway's sides run straight down to cut corners. A pill's corners round by 16 px instead of half its height. A pipe's ends run straight down past the Rows, and round off over 16 px. So each Row's Ports, at the middle of its band, meet a straight side.
5. **Hues.**
   - The Kinds fall into five families, each with a hue: `users` (person, client), `system`, `compute` (gateway, service, worker, function), `data` (database, cache, storage, search) and `messaging` (queue).
   - A Node's `<g>` takes its family's hue as its `color`, through a `[data-node][data-kind="…"]` selector. Its outline, badge and lines use `currentColor`.
   - Each shape of an outline is drawn twice: filled with `--diagram-surface`, then tinted with the hue at a fill opacity of 0.08 (0.16 for a system) and stroked. So a Node looks the same over anything behind it.
6. **The header.** This replaces the 12 px on each side of ticket 04's decision 3.
   - The badge sits 12 px in from the outline's face, centered on the header's middle.
   - The title is centered in the room from 8 px after the badge to 12 px before the face's far side, or to 8 px before a status mark. The fallback fonts' extra width, at most about 1% (ticket 04, decision 8), still fits in 8 px.
   - The face starts 18 px in from a queue's right side, past the pipe's open end, and 5 px in from a worker's, past the card behind. Row text keeps to the face too, and so does the line above the Rows, drawn in the hue.
   - Laid out `right`, the header Ports are level with the header's middle: 24 px down for most Kinds, 32 for a system, and 56 for a person.
7. **External** dashes every stroke of the outline, but not the badge, in a rhythm of 4 and 2.5 times the stroke's width. Solid parts, such as a window's title bar, lie under the outline's stroke, so that its dashes stay clean.
8. **Statuses** are `architectureStatuses`. Each mark is 12 px square, at the end of the header:
   - `ok` is a dot in `--diagram-ok`;
   - `degraded` is a triangle in `--diagram-warn`;
   - `down` is a cross in `--diagram-danger`;
   - `unknown` is a square in `--diagram-muted`.

   A status the Notation doesn't have is the error `unknown-status`, and one that isn't a string is `model-shape`.
9. **Callouts.**
   - The tag is a pill 20 px high, 4 px above its Node, at the Node's left edge, as wide as its text plus 8 px on each side. The text is Inter SemiBold at 11 px, in `--diagram-surface` on `--diagram-accent`.
   - Laid out `right`, a tag may be as wide as its Node. Laid out `down`, it stops 12 px short of the input Port at the middle of the Node's top, where Edges come in from above. So a long callout is shortened there, with the usual `text-shortened` warning: on a 176 px Node, "single point of failure" doesn't fit, but "SPOF" does.
   - The highlighted outline is 1 px wider than usual, in `--diagram-accent`.
   - A callout must hold some text other than white space, or it's a `model-shape` error.
10. **Room for a tag.**
    - Laid out `right`, layout gives the tag's 24 px across the rank, before the Node.
    - Laid out `down`, it gives them along the rank, before the Node's rank. The rank's line stays put, so the rank's other Nodes don't move, and the gap before the rank grows.
    - The router treats each tag as an obstacle, with grid lines half a clearance around it, as it treats a Node.
11. **The theme.**
    - `src/core/theme.ts` holds each property's light and dark fallbacks: `background`, `surface`, `border`, `ink`, `muted`, `accent`, `ok`, `warn`, `danger`, and a `hue-` for each family.
    - The SVG's style has one rule for each use of a color, with its light fallback, then a `@media (prefers-color-scheme: dark)` block that repeats every rule with its dark fallback. It writes only the uses its drawing needs.
    - A rectangle in `--diagram-background` fills the drawing. So the SVG stays readable on a page whose theme differs from the viewer's, as on GitHub when its theme and the system's disagree.
    - Edges are drawn in `--diagram-muted` until ticket 11 styles them.
12. **Classes.** The SVG's own classes start with `diagram-`, as in `diagram-base`, `diagram-text`, `diagram-status-down` and `diagram-tag`, so that a page's CSS is unlikely to reach them when the SVG is inlined.
13. **The scope's hash** also covers the theme's rules, written without the scope, so that two SVGs styled differently never share a name. This changes ticket 04's decision 7.
14. **Tests look as a viewer does.** `test/support/svg.ts` reads an SVG with its own small XML, CSS and geometry readers. It finds the color at a point by blending the fills painted there, and the color tests check every `<text>` that way, in both themes.
15. **For PNG export (ticket 13).** resvg 2.6 reads neither `var()` nor `@media`. To draw a theme, replace each `var(--diagram-…, fallback)` with its fallback, and for dark, use the rules in the `@media` block in place of those before it. The selectors use only classes and attributes, and paint uses `currentColor`, all of which resvg reads.
16. **Rules added:** `unknown-status`.

**Ticket 08**

1. **Rows in the model.**
   - `rows` lists `{ name, value? }`, and both are strings, so a number is written `value: "3"`.
   - Each Row's name is unique within its Node, since an Edge end names a Row by its name. Two Rows of one name are an error, `duplicate-row`.
   - An empty value draws as no value.
2. **Row ends.** This settles ticket 01's decision 3.
   - In the model, an Edge end is a Node id or `{ node, row }`.
   - In the authoring API, `handle.row(name)` gives that object. Written out with ids, it's checked only by validation.
   - A default Edge id still names only the two Nodes, so two Edges from different Rows of one Node to the same Node need ids of their own.
   - A missing Row is an `edge-end` error at `/edges/<n>/from/row` or `/to/row`, listing the Node's Rows, each quoted, since names may hold spaces.
3. **Types.**
   - `NodeHandle<R>` carries the Rows' names as `R`, which is `never` for a Node without Rows. `d.node` infers `R` from the names written.
   - A shared Node keeps its Rows' names only when it's written `as const satisfies ArchitectureNode`. With `satisfies` alone, they widen to `string`, and any name type-checks.
4. **Sizes.** These keep ticket 02's rule that Node sizes are multiples of 16 px.
   - The header is 48 px, the height a whole Node had before. Ticket 07 sizes it by Kind.
   - Each Row adds a band of 32 px, so every Row's Ports land on the 8 px grid too.
   - For `right`, a Node's header Ports stay level with its header, so the Node reaches 24 px above its Ports' line and the rest below it.
5. **Row text.**
   - It's Inter Regular at 12 px, level in the middle of its band, with 12 px clear on each side of the Node, or of its outline's face since ticket 07, and at least 8 px between name and value.
   - It's still drawn centered on its point, so names line up on the left and values on the right because each point sits half the text's width in.
   - White space collapses as in titles. The SVG draws a line across the Node at the top of the first Row's band.
6. **Shortening.**
   - When name and value don't fit side by side, the name is shortened first, as far as its first character and the ellipsis. Only then is the value shortened, to the room left beside that.
   - A Row without a value has the whole width for its name.
   - Each shortened text gets its own `text-shortened` warning, and each text with characters the font lacks its own `glyph-missing`, pointing at `/nodes/<n>/rows/<m>/name` or `/value`.
7. **Row Ports.**
   - A Row's `input` Port is on its Node's left side and its `output` Port on the right, in both directions.
   - An Edge that starts at a Row leaves from its output Port, and one that ends at a Row enters at its input Port: the sides that header Ports have for `right`. So on a `down` Diagram, an Edge attached to a Row leaves or enters sideways.
   - Row Ports have stubs like header Ports. The grid has lines through every Row Port's stub, whether an Edge uses it or not.
8. **The fallback** works in the frame of the Ports' stubs rather than the Diagram's direction. When one stub runs along x and the other along y, as a Row Port and a header Port do on a `down` Diagram, the route joins the ends of the two stubs with one corner.
9. **The scene and the SVG.**
   - A scene Node has `rows`, each with its band as `box`, its `name` and `value` texts, and its `input` and `output` Ports.
   - A scene Edge has `fromRow` and `toRow` when an end names a Row.
   - The Edge's `<g>` then carries `data-from-row` after `data-from`, and `data-to-row` after `data-to`.
10. **Rules added:** `duplicate-row`.

**Ticket 13**

1. **The command.**
   - `<diagram>` is the path of the Diagram's module, from the working directory. A path that isn't a `*.diagram.ts` file, or that lies outside the Atlas, exits with 2.
   - `--format` has no default. Each option takes its value as `--format png` or `--format=png`.
   - `--theme` is `light` unless told otherwise, and `--scale` is 1. `--scale` takes a number from 0.25 to 8: resvg ignores all its options when the zoom isn't a number, and draws whatever size it's asked for, such as 188,800 by 33,600 pixels for the example at 100.
   - A PNG is the SVG's width and height times the scale, each rounded to the nearest pixel, as resvg rounds them.
   - Both formats come from a fresh render, the one `render` would write, not from the SVG on disk, which may be stale.
2. **Output.**
   - stdout gets only the file's absolute path, so that a script can read it. Errors and warnings go to stderr, in lint's format.
   - The exit code is 0 when the file is written, with or without warnings. It's 1 when the Diagram has errors, and then nothing is written. It's 2 for arguments it can't use, a module that isn't there, or a file it can't write.
3. **Where files go.**
   - By default, into `.diagrams-cache/export/`, under the Diagram's id: `docs/shop.json`, `docs/shop.light.png` and `docs/shop.dark@2x.png`. A PNG's name always has its theme, and has its scale unless that's 1.
   - The cache folder gets a `.gitignore` of `*` when it's made, so git ignores the folder in any repo, whatever the repo's own `.gitignore` says.
   - `--out` names the file, from the working directory. Its folders are made as needed.
4. **JSON** is the module's default export, with the `id` that the Atlas gives it placed after `notation`, where a builder puts an explicit id. It's indented by two spaces and ends with a newline.
5. **The rasterizer** is `@resvg/resvg-js` 2.6.2, pinned exactly, since a newer resvg may draw differently.
   - It's MPL-2.0, unmodified, and the only runtime dependency, of `packages/diagrams`. Biome's `noRestrictedImports` rejects it outside `src/cli/`.
   - It ships prebuilt binaries and has no install scripts. With nothing added to the system, it installed and exported on Debian 13 (arm64 and amd64) and on Alpine (arm64, musl).
6. **Fonts.** This changes the spec's "the bundled font handed straight to the rasterizer".
   - resvg draws text in the font faces that the SVG embeds, the subset of the bundled font. They're written to a temporary folder, since resvg takes fonts only as files and reads no `@font-face`.
   - Given the bundled files themselves, resvg applies Inter's contextual alternates, and neither `font-variant-ligatures` nor `font-feature-settings` stops it. They turn `->` into a narrower arrow and raise the colon in `12:30`, so the text no longer matches the SVG's, whose subset has no `GSUB`. resvg does honor the SVG's `font-kerning: none`.
   - System fonts are off, so the faces are all that resvg has, and every text falls back to their family. The SVG's `font-family` stays as written.
7. **The SVG as resvg gets it,** on top of ticket 07's decision 15:
   - Every at-rule goes. That takes out `@font-face` now, and `@keyframes` in slice 4, so the PNG has no animation.
   - resvg takes `dominant-baseline` only from an element's parent, but the SVG sets it on the group around all Nodes, two levels above each text. So a rule sets it on each text inside an element that has it. Without that rule, every text sat 5 px high.
8. **Tests read PNGs with their own decoder,** `test/support/png.ts`, written from the PNG specification. They check sizes from the header, the theme from the background's pixels, and where each text's ink lies: across, the span that Inter's advance widths give, and up and down, capitals centered on their point, as browsers draw them.

### References

**Routing and layout papers**

- M. Wybrow, K. Marriott, P. J. Stuckey. "Orthogonal Connector Routing." _Graph Drawing 2009_, LNCS 5849, pp. 219–231.
- K. Marriott, P. J. Stuckey, M. Wybrow. "Seeing Around Corners: Fast Orthogonal Connector Routing." _Diagrams 2014_, LNCS 8578.
- L. McMurchie, C. Ebeling. "PathFinder: A Negotiation-Based Performance-Driven Router for FPGAs." _FPGA 1995_.
- K. Sugiyama, S. Tagawa, M. Toda. "Methods for Visual Understanding of Hierarchical System Structures." _IEEE Transactions on Systems, Man, and Cybernetics_ 11(2), 1981.
- E. R. Gansner, E. Koutsofios, S. C. North, K.-P. Vo. "A Technique for Drawing Directed Graphs." _IEEE Transactions on Software Engineering_ 19(3), 1993.
- U. Brandes, B. Köpf. "Fast and Simple Horizontal Coordinate Assignment." _Graph Drawing 2001_, LNCS 2265.

**Context-map patterns**

- E. Evans. _Domain-Driven Design: Tackling Complexity in the Heart of Software_. Addison-Wesley, 2003. Source of partnership, shared kernel, customer-supplier, conformist, anticorruption layer, open host service, published language and separate ways.

**Assets and formats**

- Inter, by Rasmus Andersson, under the SIL Open Font License 1.1.
- Simple Icons, under CC0 1.0.
- The OpenType specification, for building font subsets.
