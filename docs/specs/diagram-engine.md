# Diagram engine v1

Tracked in [issue #1](https://github.com/javlonbek-sharipov/the-platform/issues/1).

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
- A lefthook pre-commit hook runs Biome and then `diagrams lint --staged`, which lints what the commit would hold.
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
   - Holds one builder per Notation, each made from its Notation's definition by what every builder shares, the helper for the Atlas config, and the JSON model's types.
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
- **Roles.** Each role at an end of an Edge must be one of the Notation's roles, and one that the Edge's Kind lets that end carry.
- **Fields.** A Node, a Group or an Edge has only those of its optional fields that its Diagram's Notation lists.
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
- a sentence form for each Edge Kind, for screen readers and the SVG's description, such as "A calls B";
- which Edge Kinds are symmetric, and so drawn without an arrowhead or chevrons;
- which facts the description lists for a Node;
- which Group Kinds make an Edge cross between them, as `region` and `zone` do in architecture;
- which roles the ends of its Edges may carry, and which of them each end of each Edge Kind may carry;
- how its Edges bundle;
- which of the model's optional fields its Diagrams may have.

A thing's Kind alone decides how it looks.

Each Notation is one definition, which the rest of the engine reads: validation, layout, the SVG writer, the description, the JSON Schema, the model's types and the builder. Nothing outside the definition names one of its Kinds, so a Notation is added without touching the core.

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
  - `emits` runs from aggregate to an event inside its own context.
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
   - Each gap between two ranks leaves room for the labels and lanes of the Edges that span it, and for the role tags of the Edges that leave and enter there.
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
   - Do the same around each Group's label box: the part of its label band that its title fills.
   - Add one more line on each side, outside the whole drawing, so a route can go around everything.

   Each line sits half a clearance from a Node, so a line runs down the middle of even the narrowest corridor.
   - The grid's vertices are the points where lines cross, outside every Node and label.
   - A segment between two neighboring vertices is open when it doesn't pass through a Node or a label.
2. **Capacity.**
   - For each open segment, measure the free width across it: the distance to the nearest obstacle on each side.
   - That width divided by the lane spacing is the number of lanes that fit.
   - Parallel segments between the same two obstacles lie in one corridor, and share its lanes.
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
   - So a label needs a run of its own that holds it. When a bundle's trunk would leave a labeled Edge no such run, the Edge stays out of the trunk and keeps its own lane, as a parallel Edge does.
   - If it would cover a Node, a Port stub, a Group label, a role tag or another label, try the next-longest run.
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
  - its role tags, each with the end that carries it, its box and its text;
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
- Every role tag is drawn in a `<g>` of its own too, which carries its Edge's id, the end that carries the role, and the role.

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
  - Its end markers sit at its ends, and its role tags near them, on its own line.
  - Where one Port feeds two or more Edges, a small junction mark sits over the split.
- **Groups.** A Group's box shows its title in its label band.

**Theme**

- Colors come from semantic CSS custom properties prefixed `--diagram-`:
  - `background`, `surface`, `border`, `ink` and `muted`;
  - `accent`, `ok`, `warn` and `danger`;
  - `edge` and `edge-casing`, an Edge's body and the casing around it, and `warn-casing`, the casing of an Edge in the warning color;
  - one hue for each family of Kinds, which its Notation names, as in `hue-compute`.
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

- elements are written in model order, except that Edges which cross between regions or zones come first, beneath the others, and attributes in a fixed order;
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
- An Edge fell back to the simple route, its label couldn't be placed clear of everything else, or one of its role tags had no room at its end.
- An id from another context, such as `ordering/order-placed`, isn't drawn inside its own context on any Diagram.

**Output**

- By default, one line per message: `file:line:column: severity: message (rule)`.
- With `--json`, JSON, for agents.

### CLI

**`diagrams render [paths…]`**

- Writes each `<name>.diagram.svg` next to its source.
- With no paths, it renders the whole Atlas.
- Each path names a Diagram's module in the Atlas, or a folder of the Atlas, for every module in it. Anything else exits with 2, and nothing is rendered.
- A Diagram with errors gets no new SVG: its errors are printed, and the exit code is 1.

**`diagrams lint [--json] [--staged]`**

- Exits with 1 if there's any error, and with 0 otherwise.
- With `--staged`, it lints what git has staged, which a commit would hold, rather than the working tree.

**`diagrams export <diagram> --format png|json [--theme light|dark] [--scale n] [--out path]`**

- Writes a PNG, or the JSON model, and prints its path.
- By default, the file goes into a cache folder that git ignores. PNGs are for looking at, and are never committed.
- The PNG is drawn from the same SVG:
  - with the theme properties resolved to the chosen theme's colors;
  - with the font faces that the SVG embeds, its subset of the bundled font, handed to the rasterizer;
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
   - `src/core/outlines.ts` draws each outline as path data, with only the arithmetic that the spec's Arithmetic allows, rounding included, so another renderer could use it. A chip's pins round down to whole steps. (Review 1 widened this from addition, subtraction, multiplication and division.)
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
   - resvg takes `dominant-baseline` only from an element's parent, but the SVG sets it on the group around all Nodes, and on the one around all Groups (since ticket 06), two levels above each text. So a rule sets it on each text inside an element that has it, Group titles included. Without that rule, every text sat 5 px high.
8. **Tests read PNGs with their own decoder,** `test/support/png.ts`, written from the PNG specification. They check sizes from the header, the theme from the background's pixels, and where each text's ink lies: across, the span that Inter's advance widths give, and up and down, capitals centered on their point, as browsers draw them.

**Ticket 09**

1. **Default Edge ids.** This settles the Rules' "both must be given ids".
   - An Edge whose id is its default name keeps the default. The default name is its two Nodes' ids joined by `->`, whatever their Rows. Keeping it is the error `default-edge-id` when another Edge joins the same two Nodes. The error is reported at the Edge that keeps it, and names the other Edge.
   - Two Edges that both keep it are still a `duplicate-id` error.
2. **Bundles** live in `src/core/bundles.ts`, which layout and the router share.
   - An Edge's lane group is its bundle: Edges of one Kind into one Port.
   - In each bundle, the second Edge between one pair of Ports goes into a second group, and so on, so parallel Edges never share a lane.
   - The parameter is `render(diagram, { bundle })`, which takes one of three values:
     - `"target"` is the default, and the architecture Notation's choice;
     - `"source"` bundles Edges out of one Port, as the data-model Notation will want;
     - `"none"` bundles nothing.
3. **Trunks.**
   - A later Edge of a group starts its backward search at any vertex of the group's earlier routes. With `"source"`, it searches forward from them.
   - Joining a trunk from behind costs nothing, and from the side a bend. Head-on isn't allowed.
   - Joining also costs the Group borders that the rest of the trunk crosses, as crossing costs.
   - A route between two Nodes of one Group joins a trunk only inside the innermost Group that holds both, so that it stays inside it (ticket 06).
4. **Capacity.**
   - A segment's free width runs from the nearest Node, tag, Group label or same-way Group border on one side to the nearest on the other, over its length.
   - Its capacity is the width divided by the lane spacing, rounded down, and 1,000 where nothing bounds it.
5. **Negotiation.**
   - There are at most five passes.
   - Stepping onto a segment already full of other groups' lanes costs 48.
   - Each pass that leaves a segment over capacity adds 48 to its lasting history.
   - Each pass also nudges its routes. A set that nudging squeezes below the minimum spacing, or can't fit in its limits at all, counts as over capacity too, and the segments beneath it gain history. The grid's capacity can't see what makes a corridor too narrow for its lanes: one-sided limits, a neighboring line's lanes, a junction.
   - The pass that leaves the least over capacity wins.
   - Edges are routed in the order of their lane group's key, then their id.
6. **Lanes.**
   - Lanes are 8 px apart where there's room, never less than 4, and at least 8 from the sides of their corridor: Nodes, tags, Group labels and same-way Group borders. The narrowest corridor, a clearance wide, holds four.
   - The scene states this as `lanes: { spacing, minimum, padding }`.
7. **Nudging.**
   - A stretch is one lane group's runs on one line, joined where they overlap or meet.
   - An overlap set is the stretches of a line that overlap, or meet at a point where either one's corner can move, joined transitively.
   - A set is sorted by limits first: a stretch that must keep to one side of the line goes on that side. Then two stretches are compared by walking both routes along their shared path until they part. The one that turns left there runs on the left all along. Last ties go by group key.
   - Each stretch takes the lowest lane above every earlier stretch it overlaps, so stretches that don't overlap may share a lane.
   - Lanes are spaced evenly, centered on the line or on the stretch that would most rather keep it. Each lane goes as near its place as its own limits allow.
   - Neighboring lines share the room between them by what each set needs at the minimum spacing, with the rest split by what each would use at the preferred spacing. Lines too close for that are placed as one set, the lower line's lanes below the upper line's.
   - Sorting is an insertion sort, so it gives the same order in every JavaScript engine even when comparisons disagree.
8. **Stubs.**
   - A route that turns off at a stub's end may cut into its stub, leaving at least 8 px of its 16. This replaces ticket 03's test that every route passes its stub's end.
   - Every Port in use is an obstacle to other Ports' lanes. A lane beside its stub keeps to the stub's far end or beyond. Where that would squeeze a set below the minimum spacing, the set keeps only the hard limits, and crosses the stubs.
9. **Junctions.**
   - A Port's junction is the stretch of its stub's line from the stub's end out to where the farthest of its Edges turns off or jogs.
   - It's fixed at the stub's height, and only the Port's own Edges use it.
   - A stretch made only of the Port's own Edges' first runs, or last runs, holds the junction, so that it needn't jog, unless it also passes another Port's junction.
   - Nudging runs up to three rounds, each with the junctions the round before reached, until none reaches further.
10. **Jogs.**
    - A first or last run that carries its stub straight on keeps the stub's line where it can: a route straight from stub to stub first, then a junction's holder. Otherwise it jogs.
    - At one Port, the jog to the farthest lane comes first, at the stub's end, and each nearer lane jogs 4 px further out. Every jog keeps 4 px past the Port's Edges that turn off to the same side, and clear of every other route's runs.
    - A lane group's routes share one jog.
11. **Gaps between ranks.** Each is the usual 96 px or more. It holds a clearance, for the stubs on both sides, and 8 px for each lane group whose Edges cross it, in either direction. Ticket 10 adds labels in `gapsOf` in `src/core/layers.ts`.
12. **Shared stretches in tests.** Edges that share a Port may share its junction: the stub's line on both Edges' first runs out of it, or last runs into it. Every other shared stretch between two bundles fails the property.
13. **The crowded fixture** is `test/fixtures/crowded.ts`, an online shop.
    - It has 59 Nodes, 148 Edges and 10 Groups, nested up to region › zone › system.
    - The API gateway fans out to 14 services in the EU region, two ranks on. Layout counts the region as one block there, so the whole fan-out passes the rank between through one corridor.
    - Its golden file is `crowded.svg`.
14. **Speed.**
    - `pnpm bench` runs `packages/diagrams/scripts/benchmark.ts` in plain Node, without Vitest's module runner, whose export getters skew the timings. It reports 86 ms median drawn `right` and 132 ms drawn `down`.
    - The suite's limit is 3 s.
    - The search reads each vertex's coordinates from typed arrays, and keeps its queue in typed arrays that grow.
15. **Rules added:** `default-edge-id`.

**Ticket 10**

1. **Edge fields.** `label`, `technology` and `rate` are optional strings, written after `to`, in that order.
   - A label must hold some text other than white space, as a callout must, or it's a `model-shape` error.
   - A Technology is a slug: lowercase letters and digits, in words joined by single hyphens, as an id's words are. Any slug is valid, with a logo or without. Anything else is the error `technology-format`.
   - A rate is a number with at least one digit before any decimal point, an optional `k` or `M`, a slash, and `s`, `min` or `h`, with no sign, exponent or spaces: `2k/s`, `1.5M/h` and `0.25/s`, but not `.5/s` or `1e3/s`. Anything else is the error `rate-format`.
   - Until ticket 12, a Technology is drawn as its slug.
2. **A label's box.**
   - Its text is Inter Regular at 12 px, on a line 16 px high. The Technology and the rate share the line below, at 11 px on a line 14 px high, 12 px apart, with a dot between them. The box leaves 4 px across and 2 px above and below its texts, so it's 20 px high with one line and 34 with both.
   - A label's texts are drawn at most 192 px wide, so a gap between ranks never grows past that for one label. A longer label is too long for any run, and is shortened with the usual `text-shortened` warning.
   - Shortened to fit, the label's text keeps the longest start that fits, as a title does. The Technology is shortened before the rate, as a Row's name is before its value, by the same code.
   - Warnings about a label's texts point at `/edges/<n>/label`, `/technology` or `/rate`, and come after those about Nodes and Groups.
3. **Where a label goes.**
   - The runs a label may sit beside are its Edge's own stretches: each run's straight part, between the arcs of its corners, less its Ports' stubs, less every part that another route runs along, within half a pixel. A run that crosses a Group's border makes a stretch on each side of it, so that no label sits across a border.
   - The box sits 4 px from the line, centered along the stretch, and no longer than the stretch along it. A horizontal stretch shorter than the label shortens it, but to no less than 48 px of text. A vertical stretch must be as long as the box is high.
   - Each stretch is tried on both sides. A run across the direction tries the side ahead first, toward the ranks that follow, since it turned off its stub on the side behind. A run along the direction tries above it for `right`, and right of it for `down`.
   - A label stays 4 px clear of Nodes, callouts' tags, Group labels, the stubs of the Ports that Edges use, and the labels placed before it. The scene states this as `labelSpacing: { gap, margin }`.
   - Labels are placed in three passes, each in the order of their Edges' ids. The first places a label only in full, and only where it covers no route and no Group's border, so that it hides nothing. The second places it in full wherever it's clear of the rest. The third shortens it if it must. So a label covers another route only where no run of its own has room clear of every route, and is shortened only where no run of its own has room for it in full.
   - A label that fits nowhere is drawn beside the run at its route's midpoint, in full, and gets the warning `label-placement`, at `/edges/<n>`. It may then overlap anything, so the Seam 1 property that labels overlap nothing holds for every label without that warning. An Edge whose route, past its stub, is all trunk has no run of its own, and always gets the warning.
   - Labels count in the drawing's bounds.
4. **The label's look.** The SVG draws labels over every Edge and beneath every Node, in a `<g class="diagram-labels">`. Each label's `<g data-edge-label="…">`, named by its Edge's id, holds:
   - a rect of class `diagram-label`, rounded by 4 px, in `--diagram-background`, which hides whatever passes behind the label;
   - its text, of class `diagram-label-text`, in `--diagram-ink`;
   - its Technology and rate, of class `diagram-label-detail`, in `--diagram-muted`, with a dot of radius 1.25 px between them.
5. **Gaps between ranks.** On top of ticket 09's decision 11, a gap leaves room for the widest label among the Edges that span it, with 8 px at each end: room for the box's width for `right`, where the label sits above or below a run across the gap, and for its height for `down`. So for `down`, the usual 96 px already holds a two-line label beside one lane.
6. **Hops.**
   - Two Edges cross where a horizontal run of one meets a vertical run of the other on both runs' straight parts, ends included, unless it's the end of both, where both start to curve. Edges into the same Port, Row Ports included, never hop over each other.
   - The rule is decided once for each point, over every route through it. The routes that run across the direction hop: the vertical ones for `right`, the horizontal ones for `down`, so that the long runs along the direction stay whole. But if one of them has less than half a hop's room before an arc, on either side, and every route along the direction has that room, those hop instead. If neither has, the side with more room hops, with its gap cut short at the arc.
   - A hop is a gap of 8 px centered on the crossing. The scene states it as `hop`. Gaps on one run join when they'd leave less than 4 px of stroke between them, unless that stroke holds a crossing where the Edge stays whole. So a run that passes a bundle of lanes breaks once, under all of them.
   - A scene Edge's `stroke` is its route in pieces, from gap to gap. Each piece starts and ends sharp, and keeps the route's corners and their radii. `route` stays whole, for anything that follows the Edge along its length.
   - The SVG draws an Edge's pieces as the subpaths of its one path.
7. **Rules added:** `technology-format`, `rate-format` and `label-placement`.

**Ticket 11**

1. **Edge looks live in the Notation.** `architectureEdgeLooks` gives each Edge Kind its line, `solid` for a call and `dashed` for a message, and its sentence form, a template in which `{from}` and `{to}` stand for its ends: "{from} calls {to}" and "{from} sends messages to {to}".
2. **The line.**
   - An Edge is a body 1.5 px wide over a casing 3.5 px wide, both dashed 6 and 4 for a message. Its group's `color` is the new `--diagram-edge` (#818b98 light, #9198a1 dark), which the body, the chevrons and the arrowhead take as `currentColor`, and the casing is the new `--diagram-edge-casing` (#424a53, #262c36). This replaces the last point of ticket 07's decision 11.
   - The casing needed properties of its own: `ink` is darker than `muted` in the light theme but lighter in the dark one, and a property keeps one meaning in both themes.
   - The path holds the stroke's pieces between hops as its subpaths, written from the target back, so that hops break casing and body alike and the dashes start at the target. The Edges of a bundle end at one Port and hop together, so they dash alike along their trunk. The piece at the target stops 7 px short of the Port, inside the arrowhead.
3. **The arrowhead** is a triangle 8 px long and 9 px wide, its tip on the target Port's point, filled in the Edge's color and outlined 1 px in its casing's.
4. **Chevrons.**
   - Each scene Edge has `chevrons`, from its target back: a point, and the unit vector of the way the route runs there.
   - They sit 128 px apart along the route's runs, measured back from the target, the first 48 px from it, the middle of an Edge between neighboring ranks. Measured from the target and worked out walking back, a bundle's chevrons fall on the same points of its trunk, to the last bit. 64 px apart was too busy, mostly on dashed lines.
   - A chevron is left out where it would sit on the stretch its Edge shares out of its source's Port, or within 8 px of it; within 6 px of a corner's arc or a hop's gap on its line, whichever Edge turns or hops there; or where its drawing, which reaches 6 px from its point, would touch a label, since labels are drawn over the Edges. Every rule is the same for each Edge in a lane, so Edges that share a stretch draw the same chevrons on it.
   - An Edge left without any gets one, as near the middle of its own stretch as one fits: the part of its route past what it shares out of its source's Port, and short of what it shares into its target's, each at least the Port's stub. On the crowded fixture, 5 of 148 Edges need it drawn `right`, and 4 drawn `down`. One Edge drawn `right` has room for none, and shows its direction by its arrowhead alone: a 96 px call whose Port's other Edges run along 64 px of it, leaving 24 px between its last junction and its target.
   - One is drawn 4 px long and 7 px wide, cased like the line, and an Edge's chevrons share one casing path and one body path.
5. **Junctions.**
   - The scene's `junctions` list, for each Port that feeds two or more Edges, every point where two of their routes stop running together, which is a corner of one of them. Each names its Port by `node`, and `row` for a Row's Port. The Ports come in the order of their first Edges, each one's junctions nearest first.
   - So a Port whose Edges leave its junction one by one gets a mark at each point where one leaves, as a schematic dots every connection: the crowded fixture's gateway gets a row of them. Where Edges merge into a trunk toward one Port, nothing is marked: the spec asks only for splits, and a trunk ends in one arrowhead.
   - Each is a dot of radius 3 in the Edges' color, outlined 1.5 px in their casing's, in a `<g class="diagram-junctions">` inside the Edges' group, after every Edge. It carries `data-from`, and `data-from-row` for a Row's Port, as an Edge's group does for its source.
6. **Crossing between regions or zones.**
   - Each end counts the innermost `region` Group and the innermost `zone` Group around its Node. An Edge crosses regions when both ends have a region and they differ, and else zones, when both have a zone and they differ. An end in no Group of a Kind crosses nothing of that Kind: a web app outside every region calling into one, or a Node in a region calling one in a zone of it, isn't flagged.
   - A scene Edge that crosses has `crosses: { kind, badge }`, with `kind` `region` or `zone`. Its group carries `data-crosses`, whose rules make its `color` `--diagram-warn` and its casing the new `--diagram-warn-casing` (#7d4e00, #4b2900).
   - The badge sits in the middle of the Edge's own stretch, as in decision 4, or as near the middle as it clears every label, reaching 8 px from its point. With no own stretch, it sits in the middle of the route. It's a disc of radius 7 in the warning color, outlined 1 px in the casing's, with a globe in `--diagram-surface`: a circle, a meridian and an equator. Labels should keep clear of badges too, but ticket 10 places them first.
   - Edges that cross are drawn first, beneath the others, so that a trunk they share with Edges that don't keeps the plain color. Apart from that, Edges keep model order.
7. **What the SVG says about itself.**
   - The root `<svg>` has `role="img"`, after its class. Its first children are a `<title>` with the Diagram's title, a `<desc>`, and a `<metadata>`, before the `<style>`.
   - The `<desc>` reads `Nodes: ` and each Node as `Title (kind, External, status)`, joined by `; `, then `. Edges: ` and each Edge's sentence followed by a full stop, or `none`. It names the External flag and the status, as the drawing shows them only as shapes and colors. Titles are whole, with white space collapsed, never shortened.
   - An Edge's sentence is its Kind's sentence form with each end's title, and a Row end's name in parentheses after it. Then come ` over ` and its Technology's slug, ` at ` and its rate, ` across regions` or ` across zones`, and `: ` and its label, as in "Checkout API calls Payments API over grpc at 2k/s across regions: authorize". `sentenceOf` in `src/core/description.ts` makes it, for the web component's list in slice 3, and ticket 12 can give the Technology's display name.
   - The `<metadata>` holds the JSON model on one line, with every object's fields in code unit order, so that equal models give the same bytes however they were built.
8. **The scope's hash** leaves out the `<title>`, `<desc>` and `<metadata>`, which no style reaches, so that a change to a description or a Link changes only those lines. This changes ticket 04's decision 7, as amended by ticket 07's decision 13. The hash is worked out on four 16-bit limbs rather than BigInts: the same value, but the BigInts had become 34 of the 36 ms it took to write the crowded fixture's SVG.
9. **Text baselines.** Each `<text>` sets its own `text-anchor` and `dominant-baseline`, after its font's attributes, and no group sets either. Export no longer patches them, which replaces the second point of ticket 13's decision 7. The group of Nodes has the class `diagram-nodes`.
10. **Every fixture.** `test/support/fixtures.ts` lists the example and every Diagram that a module in `test/fixtures/` exports, drawn both ways when it's a function of the direction. The tests that check every text, every metadata, every casing and the chevrons' and junctions' properties run over that list, so fixtures that later tickets add are checked too.
11. **Speed.** On one machine, `pnpm bench` reported 89 ms median drawn `right` and 118 ms drawn `down` for the commit this ticket started from, and 81 and 111 ms with this ticket and ticket 10 merged. Marks take under 1 ms of that. The crowded fixture's SVG is now 464 KB, from 186 KB, mostly chevrons and the casing's copy of each path.

**Ticket 12**

1. **The logo table.**
   - `pnpm generate:technologies` runs `packages/diagrams/scripts/generate-technologies.ts`, which writes `src/notations/technologies.ts` from the `simple-icons` package. It's a dev dependency of the package, pinned at 16.36.0, since even a patch release may change an icon's path. A test runs the script twice and compares both outputs with the committed file, as ticket 04's metrics test does.
   - The script's list gives each Technology's slug and the slug of its icon in Simple Icons, one line each: `postgres: "postgresql"`. Our slugs are part of the model, so they're ours, written as authors would: `postgres`, `nodejs`, `google-cloud`. When Simple Icons renames an icon, in a major release, only the list changes.
   - For each slug, in code point order, the table holds the icon's `title` as its display name, and its `path` as Simple Icons gives it, in a square 24 units wide. It leaves out the icon's `hex`, its brand color.
   - The package exports the table as `technologies`, so the agent skill and the docs can list it.
2. **Licenses.**
   - The package is CC0, but 224 of its 3,467 icons carry a license of their own. The script takes only icons with no `license`, or with `CC0-1.0`, and stops with a message that names any other.
   - So these show as their names: Apache Kafka, Cassandra and Pulsar (Apache-2.0), Rust and PHP (CC-BY-SA-4.0), Ruby (CC-BY-SA-2.5), JavaScript and Deno (MIT), and OpenJDK (BSD-3-Clause). Even a permissive icon would need its notice beside every SVG that drew it. Simple Icons has no AWS, Azure, Oracle or IBM icons at all.
   - CC0 waives no trademarks. Simple Icons asks its users to follow each brand's guidelines. Drawing every logo in one theme color is the spec's choice, and nobody has checked it against each brand's guidelines.
3. **The starting set** has 57 Technologies: 15 databases and other stores, 4 message brokers, 15 languages, 6 runtimes, 11 clouds, 5 gateways and proxies, and GraphQL. The table is 60 KB of source, and an SVG carries only the logos it draws.
4. **A Node's Technology.**
   - The builder takes a Node's `technology`, and writes it after `title`. The model, its validation and its schema have it from ticket 14 (its decision 3).
   - The header holds the badge, the title, the logo and the status mark, in that order. The logo is 16 px square, the badge's size, level with the header's middle, and ends where the face does or 8 px before the status mark. The title's room ends 8 px before the logo, so a title is shortened before it would touch it.
   - The Technology's name is Inter Regular at 11 px, in `--diagram-muted`, centered below the title in the title's room: its display name, or its slug when it has no logo. With it, the title rises 7 px above the header's middle and the name sits 8 px below it. The badge, the logo, the status mark and the header Ports stay level with the middle.
   - An outline's `inset.top` says how far below the header's top its face starts: past a cylinder's lid (16 px), a window's title bar (9 px) or a chip's pins (5 px). A risen title keeps its em box below that line, so a database's title sits under its lid, and the name 15 px below the title. Found by looking: the risen title crossed the lid's front edge. A test now checks that no stroke of any Kind's outline crosses the title, the name or the logo.
   - A shortened name gets `text-shortened` at `/nodes/<n>/technology`, right after the title's warnings, and so does `glyph-missing`. For a slug without a logo, the advice is a shorter slug. A logo's name can't be changed, so its message says that the logo still shows which Technology it is.
5. **A label's Technology** shows its display name after a 12 px logo, 4 px before the name, on the line below the label's text. This replaces the last point of ticket 10's decision 1. The logo and its gap count in the label's width, the line stays centered, and when it's too long the name is shortened before the rate, keeping the logo. Its warnings read as a Node's do.
6. **Drawing a logo.**
   - Each logo is an `<svg class="diagram-logo">` of its own, with its box as `x`, `y`, `width` and `height`, and `viewBox="0 0 24 24"`, around one `<path>` with the table's data. The nested viewport scales the logo exactly, where `scale(0.67)` would round a 16 px logo to 16.08. It also clips the few logos whose rounded coordinates pass their square, as Python's do by 0.06 of 24 units.
   - Every logo is filled in `--diagram-muted`, which is also the color of the Technology's name beside it, in both themes. A Node's name has the class `diagram-technology`.
   - Logos are written where they're drawn, not shared through `<symbol>` and `<use>`, whose ids would clash when two SVGs are inlined into one page.
   - The scene gives a Node `technology` and `logo`, and a label `logo`. A scene logo is the Technology's slug and its box, and the SVG writer takes the path from the table.
7. **Types.** `KnownTechnology` is the table's slugs, and `Technology` is `KnownTechnology | (string & {})`. Intersecting with `{}` keeps the union from widening into `string`, which would leave editors nothing to offer. `ArchitectureNode` and `EdgeOptions` take a `Technology`, and the model's types keep `string`. TypeScript 7's language server, asked for completions inside `technology: ""`, offers all 57 slugs, in `d.node` and in `d.edge`.
8. **The description** names a Technology by its display name: after an Edge's ` over `, as in "Orders API calls Orders DB over PostgreSQL", and among a Node's facts, after its Kind, as in `Orders API (service, Go)`. This changes ticket 11's decision 7. A screen reader can't read a logo, and the root's `role="img"` hides the name's text.
9. **The test SVG reader** in `test/support/svg.ts` reads the whole grammar of path data: curves, smooth curves, quadratic curves, commands repeated without their letter, and numbers and arc flags written without separators. It runs each closed subpath's outline back to its start, and maps nested `<svg>` viewports that scale both ways alike.
10. **Speed.** `pnpm bench` reported 78 ms median drawn `right` and 105 ms drawn `down`, about what ticket 11 left. The crowded fixture has no Technologies.

**Ticket 14**

1. **The schema.**
   - It's `packages/diagrams/diagram.schema.json`, JSON Schema draft 2020-12, written by hand. The package exports it as `@the-platform/diagrams/diagram.schema.json`.
   - It has no `$id`, since the package's public name is chosen at the first publish. Its `$defs` name each object, `node`, `row`, `group`, `edge`, `end`, `rowEnd`, `link`, `idLink` and `docLink`, so that a tool can point at one.
   - Its root `description` lists the rules that JSON Schema can't express, each by the name it's reported under: `duplicate-id`, `duplicate-row`, `edge-end`, `nesting` and `default-edge-id` from validation, and `kind-conflict`, `title-conflict` and `broken-link` from lint.
2. **Fields the model doesn't have are errors.**
   - The schema closes every object, and validation rejects such a field as `model-shape`, at the field, and lists the fields its object has: "`/edges/1/lable` must be left out: an Edge has no such field. Its fields are `id`, `kind`, `from`, `to`, `label`, `technology` and `rate`." The types forbid such a field, so validation does too, and a misspelled field is never silently ignored.
   - Each object's fields are listed in `validate.ts` with `fieldsOf<T>`, which takes an object with one `true` per field, so that the type checker holds the list to the model's type.
   - A pointer escapes `~` and `/` in a field's name, as RFC 6901 says.
   - Fields of the spec's model that the engine doesn't read yet are rejected too: Walkthroughs, whose list must be empty ("`/walkthroughs` must be an empty list: this engine doesn't play Walkthroughs yet."). The slice that reads each one adds it to the model, validation and the schema. Term Links stay rejected as ticket 05 decided, with its message. A Diagram's and a Node's `description` were rejected too, until Review 1 accepted them (its decision 2).
3. **A Node's Technology.** The model's Node has `technology`, a slug, which validation checks as it checks an Edge's (`technology-format`). Ticket 12 adds it to the authoring API, and draws it.
4. **Text that an SVG can hold.**
   - XML can't hold some characters even as character references, so no escaping writes them: U+0000 to U+001F other than tab, line feed and carriage return, a half of a surrogate pair on its own, and U+FFFE and U+FFFF. Every field that holds text must leave them out: the Diagram's id and title, a Node's title and callout, a Row's name and value, a Group's title and description, a Link's `doc`, `section` and `label`, an Edge's label, and the Row that an Edge end names. Other fields have formats that leave them out already.
   - The rule is `invalid-character`, at the field. The message names the field and each character by its code point, as in "Node `api`'s title has a control character, U+0007, which an SVG can't hold. Remove it.", or "…has characters that an SVG can't hold: U+001B and U+0007. Remove them." A Row's name or a Link's target in a message shows such characters as escapes, `\u0007`, never raw.
   - Its errors come after those of the other rules. Characters that XML allows but discourages, such as DEL and the C1 controls, stay valid, with the usual `glyph-missing` warning.
   - In the schema, `$defs/text` is a pattern that leaves those characters out. JSON Schema's patterns are ECMA-262 regular expressions with Unicode semantics, as Ajv runs them, so an emoji's surrogate pair passes and half of one doesn't.
5. **Checking the schema.**
   - Ajv 8.20.0 (MIT, with dependencies under MIT and BSD-3-Clause) is a dev dependency of the repo root. `test/support/schema.ts` compiles the schema in strict mode, which rejects any keyword Ajv doesn't know or would ignore, with every error reported. It names each problem by its JSON Pointer, and a missing or extra field by the field's own pointer, as the core's diagnostics do.
   - `test/fixtures/every-field.json` is generated JSON with every field the engine reads. `everyFixture()` lists JSON fixtures too, so the properties that ticket 11 checks over every fixture cover it.
   - Broken models must fail the schema at the pointer where the core reports its error. Each object must allow the fields that the core's message lists, no more and no fewer, and the schema's Kinds and statuses must be the Notation's.
6. **`resolveJsonModule`** is set in `tsconfig.json`, since TypeScript doesn't document its default under `nodenext`.
7. **Rules added:** `invalid-character`.

**Ticket 16**

1. **Which labeled Edges ride a trunk.**
   - A labeled Edge rides its bundle's trunk where routes of its lane group run along one of its runs, past its stubs. It may do so only while a run of its own, as ticket 10's decision 3 counts them, still holds its label in full: the box's width along a horizontal run, and its height along a vertical one.
   - In full, because each gap between ranks leaves room for a label in full (ticket 10, decision 5). A trunk that left a shorter run would shorten the label, and the warning would ask the author for a shorter label when the trunk is to blame.
   - An Edge with no such run is crowded out. It gets a lane group of its own, keyed by its bundle's key and its id, as a parallel Edge gets one. It joins no trunk, no Edge joins it, and it keeps its lane from end to end, sharing only its Ports' junctions, as parallel Edges do. It doesn't join the trunk past its label instead, since nudging gives each route one lane group.
   - Unlabeled Edges, and labeled Edges that keep such a run, bundle as before.
2. **Found by routing, then laid out and routed again.**
   - Whether a trunk takes a label's run depends on the routes. So `render` lays out and routes as before, and the router reports the labeled Edges that their trunks crowd out. Those keep lanes of their own, and layout and routing run again, with layout leaving a lane for each in the gaps it crosses (ticket 09, decision 11). This repeats until no trunk crowds out a label, at most 5 times in all. Each time only adds Edges, and an Edge that has a lane of its own keeps it.
   - Crowding Edges out of a bundle changes its trunk, which can crowd out others. Over 400 random Diagrams of up to 18 Nodes and 34 Edges, 70% of the Edges labeled, a render took 1 to 4 rounds. The crowded fixture with every Edge labeled takes 3 rounds drawn `right`, with 35 Edges in lanes of their own, and 2 drawn `down`, with 26.
   - A Diagram whose trunks crowd out no label is laid out and routed once, as before.
3. **The warning says why.** A label drawn at its route's midpoint gets one of three `label-placement` messages:
   - when the Edge has no run of its own past its stubs: "Edge `x`'s label has no run of its own, since other Edges run along all of its route past its stubs. So it's drawn at the middle of its route." Now that trunks keep off labels' runs, this shows mostly on fallback routes (step 11), where two Edges can take one simple route;
   - when no run of its own is long enough for the label, even shortened to 48 px of text (ticket 10, decision 3): "Edge `x`'s label is too long for any run of the Edge's own, so it's drawn at the middle of its route. Shorten it to fit beside a run." A shorter label fits a horizontal run, and one without its Technology and rate is shorter along a vertical one;
   - otherwise, when every place beside a run long enough covers something, the message ticket 10 gave every one: "…has no room beside any run of the Edge's own, clear of Nodes, Port stubs, Group labels and other labels, so it's drawn at the middle of its route."

   This replaces the last sentence of the sixth point of ticket 10's decision 3, about an Edge that is all trunk past its stub.
4. **Speed.** With no labels crowded out, a render costs what it did: `pnpm bench` reports 79 ms median drawn `right` and 107 ms drawn `down`. It now times the crowded fixture with every Edge labeled too: 331 ms and 140 ms, from 70 ms and 66 ms on the commit this ticket merged. The second of three rounds drawn `right` costs the most, 162 ms, since its negotiation runs all 5 passes without clearing every corridor. The third, whose layout leaves room for 2 more lanes, needs 2 passes.

**Ticket 15**

1. **Where the skill lives.**
   - It's `packages/diagrams/skills/diagrams/SKILL.md`, in the package, as Modules say. Its folder has the skill's name, `diagrams`, which the Agent Skills format requires of a skill's `name`.
   - `.claude/skills/diagrams`, where Claude Code looks, and `.agents/skills/diagrams`, where Codex looks, are relative symlinks to that folder, committed. Both tools' docs say they follow a symlinked skill folder. Both look from where they start up to the repo's root, and Claude Code stops at a worktree's root, so the links sit at the root. A Windows checkout would need git's `core.symlinks`, which nobody has tried.
   - It has a `description`, so agents reach it on their own. AGENTS.md names its path too, for agents that read no skills, and says when to read it in the same three cases as the description.
2. **Its example is the package's.**
   - The skill shows `docs/example-system.diagram.ts` in full, under its `## Example` heading, since "the example system" is what the manual check asks an agent to extend. A test checks the copy byte for byte. So the repo renders, lints and type-checks the Diagram that the skill teaches, and a module that draws its ids again gives them the same Kinds and titles.
   - The example's comment now uses only the glossary's words, and no longer says that each ticket extends the example. The test that checks the copy says so instead, where a ticket that extends the example will find it.
3. **The tests read the skill as an agent does.**
   - One writes the skill's example into a sample Atlas, and runs each `pnpm exec diagrams …` command the skill gives, in its order, with `<module>` standing for the module's path. Render must write the SVG, `lint --json` must list no messages, and export must print the path of a PNG.
   - Another checks that the skill names, in backticks, every Kind, Group Kind, Edge Kind and status of the architecture Notation, and every Technology in the logo table. A later ticket that adds one must teach it.
   - A third checks that both links reach the skill, that its `name` is their folder's, and that AGENTS.md gives its path.
4. **The finishing steps added a type check.** The builder copied only the options it knew. So a misspelled option, such as `lable`, vanished: render and lint passed, and the label just wasn't drawn. Only `pnpm typecheck` caught it, so the skill ran it before lint. Review 1 makes every authoring function reject an option it doesn't know (its decision 5), so the skill's finishing steps no longer type-check.
5. **Numbers it gives.** Measured over 21 titles on five Kinds, a title fits in about 16 characters, or 14 beside a logo: "Inventory service" fits, "Customer accounts" doesn't, and beside a logo "Product search" fits and "Orders database" doesn't. Export keeps its defaults: at scale 1 the example's PNG is 2664 px wide, and its text stays legible when an image viewer shrinks it to 2000.
6. **It teaches only what's built.** Term Links, namespaces, Walkthroughs and the domain Notation wait for slices 2 and 4, which add them to the skill, and their Kinds to the naming test.
7. **Biome reads frontmatter.** Biome 2.6 formats Markdown, and without `markdown.parser.frontmatter` it reads a skill's frontmatter as a rule and a heading, and puts a blank line after the first `---`. `biome.json` turns the option on, and the frontmatter stays as written.

**Orchestrator**

Scope moved or added while the tickets ran. Each ticket's Comments say why.

1. Ticket 11 gained the `<metadata>` model, and gained per-text baselines.
2. Ticket 09 gained the rank gaps' room for lanes, and the lane offsets with their jog.
3. Ticket 14 gained the rejection of control characters in text.
4. Ticket 06's Group-containment check now names the property that can be tested.
5. A labeled Edge stays out of a trunk that would leave it no run of its own for its label (Edge routing, step 8). Ticket 16 builds it.

**Review 1**

The fix of [code review 1](https://github.com/javlonbek-sharipov/the-platform/blob/e5f18741e9601483efb359902bf99cdebf446cc1/.scratch/diagram-engine/review-1.md) settled these. Where one amends the spec, the main text says so now.

1. **The Atlas index.**
   - `diagrams export --index [--out path]` writes it as JSON indented by two spaces, by default to `.diagrams-cache/index.json`, and prints its absolute path. It sits outside `export/`, so that no Diagram's JSON export can take its name.
   - It's `{ diagrams, ids, terms }`. Each Diagram has its `id`, `title`, `notation` and `svg`, a repo path, in path order. `ids` is keyed by id, in code unit order, and each holds its `kind`, its `title`, and the ids of the Diagrams that draw it, `asNode` and `asGroup`. `terms` stays empty until slice 2 brings glossaries.
   - The index holds only what's true across the Atlas, so a Diagram with errors, or an id with two Kinds or two titles, leaves none: the errors go to stderr in lint's format, and the exit code is 1. Warnings are lint's to print.
   - With `--index`, export takes no Diagram and no option but `--out`. Anything else exits with 2.
2. **Descriptions.** A Diagram, a Node and a Group each take a `description`, as the version 1 fields have them: in the builder, validation and the schema. Nothing draws it. The SVG's `<metadata>` carries it, and a test checks that a description changes no other line. Its text must be one an SVG can hold (`invalid-character`). This replaces the point of ticket 14's decision 2 that rejected them. Walkthroughs stay rejected until slice 4.
3. **Theme properties.** The Theme's list gains `edge`, `edge-casing` and `warn-casing`, which ticket 11 added (its decisions 2 and 6). A host page that themes Diagrams defines them too.
4. **Paths for `render`.**
   - Each path names a Diagram's module in the Atlas, or a folder of it, for every module inside. Anything else exits with 2, renders nothing, and says why: a file that isn't a `*.diagram.ts` module or isn't there, a path outside the root, or a module that git ignores.
   - `export` shares the check, so it now refuses a module that git ignores too. The Atlas leaves such a module out, so ticket 13's decision 1 already counted it as outside.
   - The SVG's path is made only from a path that ends in `.diagram.ts`.
5. **Options the authoring API doesn't know.**
   - Every authoring function records each option it doesn't know as a `model-shape` error, beside the model, as it records declarations: under `Symbol.for("@the-platform/diagrams/unknown-options")`, where JSON leaves it out. The module loader carries the errors across, as it carries declarations.
   - Validation reports them first among the shape errors, each at the pointer where the option would go, as in `/edges/1/lable`, so the Atlas places it at the call. Each message lists the function's options: "An Edge has no option `lable`. Its options are `kind`, `id`, `label`, `technology` and `rate`."
   - An option set to `undefined` is no option, as for the options a function knows.
   - `atlas()` records its call too. The config has no options yet, so any is an error: "The Atlas config has no option `contexts`. It has no options yet."
   - The builder could have passed an unknown option on to the model, where validation rejects a field the model lacks. But some names would collide with fields the builder writes itself, such as a Group's `members` or an Edge's `from`, and the message would list model fields that aren't options.
6. **The pre-commit hook judges what's staged.**
   - `diagrams lint --staged` copies every file that git has staged under the root into a temporary folder, with `git checkout-index`, links the repo's `node_modules` folders into it from the root up, lints the copy, and names each file by its own path. Its SVG messages say to stage the SVG: "The staged SVG doesn't match its staged source. Run `diagrams render`, and stage the SVG with its source."
   - Inside a hook, git names the index it commits in `GIT_INDEX_FILE`, which differs from the usual index for `git commit -a` and `git commit <paths>`. The copy follows it when it lies inside the Atlas's own git folder, a relative path being relative to the working directory.
   - lefthook runs it. lefthook 2.2.2 has no option that hides unstaged changes from a command.
   - Outside a git repo, `--staged` exits with 2.
7. **Decisions that the main text now follows.** Ticket 13's decision 6 hands the rasterizer the SVG's own font faces, ticket 11's decision 6 writes Edges that cross between regions or zones first, and ticket 06's decision 5 makes only each Group's label box an obstacle. All three stand. Tickets 13 and 06 say the same in their checkboxes.
8. **Looks live in the Notation, for Groups and statuses too.** `architectureGroupLooks` gives each Group Kind its stroke's width and its line, and `architectureStatusLooks` gives each status its mark and its color. The scene types each Kind and status as the model does, so the SVG writer looks each one up without a cast.
9. **Corridors share capacity.** This changes ticket 09's decisions 4 and 5.
   - The grid's parallel segments over one stretch, with the same nearest obstacle or Group border on each side, lie in one corridor. Its capacity is its width divided by the lane spacing, and it counts the lane groups on all its segments, since nudging spreads their lanes across its one width. A corridor over capacity adds history to each of its segments.
   - Before, the grid measured each line's segments alone. Drawn `down` with every Edge labeled, the crowded fixture put five lanes 4 px apart through each of two corridors a clearance wide, from two grid lines each, and its second round of routing never cleared. Now that round clears in two passes. A routing property checks every corridor on labeled copies of every routing fixture.
   - No golden file and no committed SVG changed. `pnpm bench` reports 83 ms median drawn `right`, 111 ms drawn `down`, and 362 and 143 ms with every Edge labeled, from 80, 105, 346 and 144 ms.
10. **Where code lives now.** The refactors changed no golden file and no committed SVG.
    - The SVG writer is split: `src/core/xml.ts` writes the XML, `encoding.ts` the hash and base64, `style.ts` the font faces and the theme's rules, and `edge-paths.ts` the path data along Edges. The theme writes a rule for each class or attribute that the drawing holds, so a new class needs only its rule.
    - `src/core/texts.ts` walks every text of the model, for validation's `invalid-character` check and for the drawing's text warnings alike. The `invalid-character` errors of one Node or Edge now come in model order: a Node's callout after its Rows and Links, and the Rows an Edge's ends name before its label.
    - `geometry.ts` holds the heading of a run, rounding up to a step, and a stretch of a line. `bundles.ts` holds the lane spacing and the default bundling, which `render` sets once.
11. **Arithmetic.** Ticket 07's decision 1 now allows the arithmetic that the spec's Arithmetic allows, rounding included, so a chip's pins may round down.

**Issue 2**

1. **A Notation's definition.**
   - It's one object, `src/notations/<name>.ts`, of the type `Notation` in `src/notations/notation.ts`. It holds:
     - its `name`;
     - the `fields` its Diagrams may have;
     - its `hues`;
     - its `nodeKinds`, each with its size, outline, badge and hue;
     - its `statuses`, each with its mark and color;
     - the `facts` the description lists for a Node;
     - its `groupKinds`, each with its border and, when Edges cross between Groups of it, its `crossing`;
     - its `edgeKinds`, each with its line, its sentence form, whether it's `symmetric`, and the Node Kinds it may start at and end at, `from` and `to`;
     - its `bundling`.
   - `src/notations/notations.ts` lists the engine's Notations. `render(diagram, { notations })` reads a Diagram in others instead, which is how the tests draw a Notation that only they define: a house's plumbing, in `test/support/plumbing.ts`.
   - The package exports `architectureNotation` and `notations`, and `nodeKindsOf`, `groupKindsOf`, `edgeKindsOf` and `statusesOf`, which list a definition's Kinds and statuses in its order. They replace the lists and looks of ticket 07's decisions 1, 5 and 8, ticket 11's decision 1 and Review 1's decision 8: `architectureNodeKinds`, `architectureNodeLooks`, `architectureFamilies`, `architectureStatuses`, `architectureStatusLooks`, `architectureGroupKinds`, `architectureGroupLooks`, `architectureEdgeKinds` and `architectureEdgeLooks`.
   - The Technology helpers moved to `src/core/technology.ts`, since they belong to no Notation. The logo table stays where its script writes it.
2. **Hues live in the definition.** This changes ticket 07's decision 11.
   - A definition names each hue and gives its light and dark fallbacks. Its property is still `--diagram-hue-` and its name. `src/core/theme.ts` keeps the colors that every Diagram shares.
   - Two Notations that name a hue alike share its property, so a page sets it once for both.
3. **Fields.**
   - The model's optional fields are `technology`, `external`, `status`, `rows`, `description`, `links` and `callout` for a Node, `description` and `links` for a Group, and `label`, `technology` and `rate` for an Edge. A definition lists those its Diagrams may have. Every Notation's have the rest: `id`, `kind`, `title`, a Group's `members` and an Edge's ends. A Diagram's own fields are the same in every Notation.
   - Any other field is still `model-shape`. When the model has the field but the Diagram's Notation doesn't, the message says so: "`/nodes/0/technology` must be left out: a Node has no such field in the plumbing Notation. Its fields are `id`, `kind`, `title`, `external`, `status`, `rows` and `description`." The builder's error for such an option reads alike: "A Node has no option `technology` in the plumbing Notation." Architecture lists every field, so none of its messages changed.
   - A Notation's Nodes may have a `status` exactly when it has statuses.
4. **Which Node Kinds an Edge Kind may join.**
   - `from` lists the Kinds it may start at, and `to` those it may end at. Left out, any Kind will do, as for both of architecture's Edge Kinds.
   - An end of another Kind is the new error `edge-end-kind`, at the end, or at its `node` for an end at a Row: "Edge `joint` starts at `kitchen-tap`, whose Kind is `tap`. An Edge of the Kind `pipe` may start only at a Node of the Kind `tank` or `pump`."
   - It isn't reported for an end, or an Edge, whose own Kind the Notation lacks, which has its error already.
5. **Symmetric Edge Kinds.**
   - An Edge of a Kind with `symmetric: true` has no chevrons in the scene and no arrowhead in the SVG, and its line runs into its target's Port instead of stopping inside an arrowhead.
   - Layout, routing and bundling treat it like any Edge, so its `to` still ranks after its `from`.
   - Nothing in the SVG marks it but its Kind. A ticket that needs a hook for it adds one.
6. **Crossing between Groups.** This widens ticket 11's decision 6.
   - A Group Kind with a `crossing` is one that Edges cross between, and `crossing` is how the description says so: `across regions`.
   - An Edge is flagged for the first such Kind, in the definition's order, for which its ends sit in different Groups. So architecture lists `region` before `zone`.
   - The scene's `crosses.kind` and the SVG's `data-crosses` hold the Group Kind's name. The warning color and the badge are the core's, the same in every Notation.
7. **Bundling.** `render` bundles as the Diagram's Notation says, unless `bundle` says otherwise. This changes the default of ticket 09's decision 2.
8. **Facts.** `facts` lists which of a Node's Kind, Technology, External flag and status the description names, in order. Architecture lists all four, in the order its descriptions had them (ticket 11's decision 7, and ticket 12's decision 8).
9. **The JSON Schema is generated.** This replaces "written by hand", and the names of the `$defs`, of ticket 14's decision 1.
   - `schemaOf(notations)`, in `src/core/schema.ts`, makes the schema for a set of Notations. `pnpm generate:schema` writes the shipped one from the engine's, laid out as Biome formats JSON. A test runs the script twice and compares both outputs with the committed file, so a Kind added to a definition fails that test until the script has run.
   - The root holds what every Diagram shares, with `notation` one of the Notations' names. Then an `allOf` has an `if` and a `then` for each Notation: a Diagram that names it must match `#/$defs/<name>`, which holds that Notation's `node`, `group` and `edge`, as in `#/$defs/architecture/$defs/node`. With `oneOf`, a validator would report a Diagram's errors against every Notation.
   - The parts that the Notations share keep their names: `id`, `text`, `someText`, `technology`, `row`, `end`, `rowEnd`, `link`, `idLink` and `docLink`. A Notation can't take one of those names.
   - The shipped schema accepts and rejects what it did. Its shared parts are the same, key for key, and architecture's `node`, `group` and `edge` differ from the old ones in four descriptions only. An Edge's `kind` no longer says how each Kind is drawn, since that's the definition's to say.
   - Its patterns for ids, Edge ids, slugs and rates are validation's own, `formats` in `src/core/validate.ts`.
   - Its description names `edge-end-kind` among the rules it can't express.
10. **The model's types.**
    - `DiagramOf<N>`, `NodeOf<N>`, `GroupOf<N>` and `EdgeOf<N>` take a Notation's Kinds, statuses and fields from its definition's type. `Diagram`, `Node`, `Group` and `Edge` are those of any of the engine's Notations: a union, told apart by `notation`, which today is architecture's alone.
    - The core, the Atlas and the CLI read an `AnyDiagram`, a Diagram of any Notation, as validation leaves it.
    - The scene names each Kind and status as a string, since a scene may be of any Notation. The SVG writer looks each one up in the definition, and throws on one that validation should have rejected. This changes Review 1's decision 8.
11. **What every builder shares.**
    - `builderOf(definition)`, in `src/authoring/builder.ts`, makes a Notation's builder: handles, Groups that declare their members in a callback, Rows whose names the types carry, an error for each unknown option, and each declaration's place. `architecture` is `builderOf(architectureNotation)`.
    - Its types are `Builder<N>`, `DiagramDeclaration`, `NodeDeclaration<N, R>`, `RowDeclaration<R>`, `GroupDeclaration<N>` and `EdgeDeclaration<N>`. Architecture's public types, `ArchitectureNode` to `EdgeOptions`, are those for its definition, and are now type aliases.
    - The definition's type has a name, `ArchitectureNotation`, so that a type error reads `NodeKindOf<ArchitectureNotation>` and not the whole definition.
12. **Holding the engine to one definition.** `test/definitions.test.ts` reads the engine's sources.
    - Outside `src/notations/<name>.ts`, no module names one of that Notation's Kinds as a string. Two uses are excused, since neither names a Kind: the `message` event of a worker thread, in `src/atlas/load.ts`, and `typeof x === "function"` anywhere. The test lists any other that only looks like a Kind's name.
    - Only `src/authoring/<name>.ts`, `src/notations/notations.ts` and `src/index.ts` import the definition.
    - Each definition refers only to hues and Node Kinds that it defines, and sizes its Nodes in steps of 16 px.
13. **Left for the domain Notation.** A definition holds nothing yet for an Edge's `roles`, for ids that are local to a `context` Group, or for a rule about a whole Diagram, such as the one against mixing a context map with an aggregate diagram. Issues 3 and 4 add what they need.
14. **Speed.** On one machine, `pnpm bench` reported 81 ms median drawn `right`, 109 ms drawn `down`, and 354 and 146 ms with every Edge labeled, for the commit this issue started from, and 81, 111, 356 and 143 ms with it.

**Issue 6**

The web component's camera and level of detail. This is GitHub's issue #6, not ticket 06 above.

1. **Where the component lives.**
   - Its modules are in `packages/diagrams/src/web-component/`, and the package exports them as `@the-platform/diagrams/web-component`. Importing that defines `<platform-diagram>`.
   - They use only erasable syntax and import each other with `.ts` extensions. Node's `stripTypeScriptTypes` strips every one of them, which the live preview will rely on.
   - Biome rejects Node's modules and `process` there, as it does in the core. The type check runs a second program for it and for its tests, `tsconfig.browser.json`, with the DOM's types. The first program still has none, so the core can't use the DOM by accident.
2. **A stage in a shadow root.**
   - The element attaches an open shadow root with one element in it, the stage. The stage holds the SVG, clips it, takes the focus and gets the reader's input. It stays while one SVG takes another's place, so the focus stays too.
   - The page's styles don't reach the SVG there, and the component's don't leak out. The `--diagram-` properties still reach it, since custom properties inherit through a shadow root.
   - The root is open, so that the tests' locators find the drawing's text. Find-in-page finds it in either kind.
3. **How it gets its SVG.**
   - An inline child is moved onto the stage, not copied: a copy would double the page's largest tree. An SVG given as a child later is taken too, and takes the place of the one before.
   - An element defined before the page has parsed its child gets the child while it's still arriving. The parser goes on filling the SVG on the stage, and the parts are told of it again at `DOMContentLoaded`. Otherwise its font would never be declared, since the SVG's style arrives after its title.
   - A `src` is fetched when the element is in a page, and again whenever it changes. Its SVG takes the place of an inline child, which shows until then. A later `src` takes over from one still on its way. Removing `src` leaves the stage as it is.
   - The spec names no events for this. The element raises `load` once a `src`'s SVG is shown, and `error` when a `src` or an inline child can't be shown, as an `ErrorEvent` whose message says why. Neither bubbles, as an `<img>`'s don't. The stage keeps what it showed.
   - An SVG without a `viewBox` isn't one the engine made, and is refused. Nothing else is checked.
   - The SVG goes into the page as it is, with whatever it holds. So a `src` must be a URL that the page trusts as it trusts its own scripts. The component doesn't sanitize it.
4. **The camera is the SVG's `viewBox`.**
   - The SVG fills the stage, and the view is written as its `viewBox`. So the browser draws the drawing as vectors at every scale, with sharp text. A CSS transform would scale a picture of it whenever the browser put it on a layer of its own.
   - The camera itself holds no element. It's told the drawing's bounds, which are the SVG's first `viewBox`, and the stage's size, and it tells whoever watches it each new view: the part of the drawing in view, and the scale.
   - With the crowded fixture (7240 by 1920 px, 1,455 elements), dragging and zooming kept 60 frames a second in headless Chromium on one laptop.
5. **Fit.**
   - It leaves a padding of 16 px, never enlarges the drawing past its natural size, and never goes below a scale of 0.7, where a Row's 12 px text is drawn at 8.4 px.
   - Along each axis, a drawing that fits sits in the middle. One that doesn't starts a padding in from the left or from the top. Drawn `right`, the sources are at the left, and the first one declared is at the top. Drawn `down`, it's the other way round. So the rule needs no direction, and the component doesn't read the model for it.
   - The view is fitted when an SVG is shown, and again whenever the stage changes size, until the reader moves the camera. `0` fits again. A view the reader chose keeps its scale and its top left corner through a change of size. A move that the limits bring to nothing doesn't count as chosen.
6. **Limits.**
   - Zoom stops at 4 times the natural size. Further off, it stops at the scale that shows the whole drawing inside the padding, or at 0.7 when that is further.
   - A drawing that fits in the stage along an axis stays in the middle of it. A larger one never shows more than the padding empty beside either end. So no drag can lose the drawing, and at the far limit the whole drawing is in view.
   - This is stricter than free panning. If issue #7's details need room beside a Node at the drawing's end, the camera can take a wider limit on that side.
7. **Keys.** On the stage, `+` or `=` zooms in by a quarter, `-` zooms out by as much, and `0` fits, around the middle of the view. `=` is the `+` key without Shift. With Ctrl, Meta or Alt held, the keys are left to the browser, whose own zoom uses them.
8. **The wheel.**
   - It zooms when the focus is on the stage or inside it, or when Ctrl or Meta is held. Browsers report a pinch on a trackpad as the wheel turning with Ctrl held, so that pinch zooms too, without the focus. Otherwise the listener does nothing, and the page scrolls. A click into the Diagram gives it the focus, and a click elsewhere takes it away.
   - A turn of 550 px zooms by e, so one notch of a mouse wheel zooms by a fifth. A pinch's turn counts 5.5 times as much, which follows the fingers. One event never zooms by more than about a quarter, which keeps Ctrl with a real wheel from jumping.
9. **A drag and a click.**
   - A drag pans wherever it starts, on a Node too. The spec says "on empty space". But v1 has nothing else to drag, and a drawing zoomed in may show no empty space at all.
   - A press of the main button becomes a drag once it has moved 4 px, or 10 px for a finger. Only then does the stage capture the pointer, so a click keeps the element that was pressed as its target.
   - After a drag, the browser's `click` is stopped at the window, before any other listener: a drag isn't a click. Only a listener that the page put on the window itself, for the capture phase, before the drag ended, still hears it.
   - A drag selects no text: the stage cancels `selectstart`. It doesn't use `user-select: none`, under which find-in-page can't select what it finds.
   - The pointer is a hand over the drawing, which closes while it drags.
10. **Touch.**
    - The stage has `touch-action: none`. One finger pans, and two zoom around the point between them and pan as it moves.
    - So a swipe that starts on a Diagram never scrolls the page. The spec asks only that the wheel doesn't trap the page. The component's own height stops short of the window's, which leaves page to swipe on.
    - Each move of a gesture is counted from the view the gesture started with, not from the move before. Two fingers report their moves one after the other, and counted step by step the first would run into a limit that the pair never reaches.
11. **The component's size.**
    - It's a block. A height that the page gives it is the stage's height.
    - Without one, it's as high as the drawing is at the scale Fit shows it, with the padding, up to 80% of the window's height. That's plain CSS on the SVG, from the stage's width as a container query length, so nothing measures and nothing shifts after the first paint.
12. **Level of detail.**
    - Rows show in full from a scale of 0.6. That's below Fit's 0.7, so Fit always shows them. Further off they fade, and from 0.45 they're hidden as well, so that they can't be pressed and find-in-page doesn't land on them.
    - A Node's box and the line under its header stay. Only the Rows' texts go, since the component never lays anything out.
    - The hook is the SVG's: each Row's texts sit in a `<g data-row="…">` that carries the Row's name as the model has it, as `data-from-row` and `data-to-row` do. The stage sets two properties, and one rule of the component's style applies them to every Row.
    - No golden file draws a Row, so none changed. The example's SVG changed by its six Rows' groups and by its scope's name, which is made from its contents.
13. **Colors.**
    - Around the drawing, the stage has the drawing's own background, `--diagram-background`. It marks the keyboard's focus with a line 2 px wide in `--diagram-accent`, inside its edge, where nothing can clip it. A click's focus gets no mark.
    - Both take the SVG's fallbacks, from `src/core/theme.ts`, for the light and the dark scheme. Every color that all Diagrams share is a property of the stage, `--theme-ink` and so on, for the parts to come. A Notation's hues aren't among them: only the SVG draws in those so far.
14. **The font.** A part reads the font faces from the SVG's own style and adds each to `document.fonts`, for as long as the SVG is on the stage of a component that's in a page. Diagrams that show the same SVG share its faces, and the last to go takes them off again.
15. **The stage's name.** The stage is a `group` named by the SVG's `<title>`, so that a reader who tabs to it hears which Diagram it is. Issue #7 owns the keyboard and the list for screen readers, and may change the role.
16. **Parts.**
    - The component is built of parts: the font, the name, the gestures and the level of detail so far. Each is a module that exports a `Part`, with a `setUp` and, if it needs them, its own rules for the style sheet.
    - `setUp` gets the stage: its element, its camera, and `onShow`, which calls back with each SVG that's shown and takes back a function for when it no longer is.
    - `parts.ts` lists them. So a later issue adds a module and one line there, and widens `Stage` when its part needs more.
17. **Tests in a real browser.**
    - Vitest runs two projects from one `vitest run`: `node`, the tests there were, and `browser`, those under `packages/diagrams/test/browser/`, in Playwright's Chromium, headless, in a page of 1280 by 720.
    - `@vitest/browser-playwright` 5.1.0 and `playwright` 1.64.1 are dev dependencies of the root, pinned exactly: each Playwright release drives one build of Chromium, which `pnpm exec playwright install chromium` downloads once for a machine. They bring 19 packages, all MIT, ISC or Apache-2.0.
    - The core draws each test's SVG in the browser, with the bundled font fetched from the dev server. So a test builds whatever Diagram it needs where it needs it.
    - `test/browser/support/` holds what the next issues can share: `drawing.ts` draws, `page.ts` puts a `<platform-diagram>` on the page as HTML would, `input.ts` presses the mouse and the keys, turns the wheel and touches the screen, and `looking.ts` says where a text is on the screen, how strongly it shows, and what color a pixel is, read off a picture of the page.
    - Every input is the browser's own, so its events are trusted. The wheel at a point and the touches go through the DevTools protocol, since Vitest's `wheel` only turns over an element's middle and has no touch.
    - A failed browser test leaves its picture under `.vitest/`, which git ignores.

**Issue 3**

Context maps. This is GitHub's issue #3, not ticket 03 above.

1. **The domain Notation.**
   - Its definition is `src/notations/domain.ts`, and its builder is `domain`, `builderOf` that definition. The package exports both, with `DomainNode`, `DomainEdgeOptions`, `DomainBuilder`, `DomainOptions`, `DomainNodeKind`, `DomainEdgeKind` and `DomainRole`.
   - `Diagram`, `Node`, `Group` and `Edge` are now those of either Notation, as issue 2's decision 10 foresaw. What reads a field that only one Notation's Diagrams have names that Notation, as in `DiagramOf<ArchitectureNotation>`.
   - A context takes `external`, `description` and `links`, and an Edge `label` and `roles`. A context has no Technology, status, Rows or callout, and an Edge no Technology or rate: those say how a thing is built and how it runs, which a context map doesn't draw.
   - The description lists a context's Kind, and that it's External.
2. **No Group Kinds yet.** Issue 4 adds `context`. Until then, a Group on a domain Diagram is an `unknown-kind` error, and `d.group` is a type error. That brought two things for any Notation:
   - Where a message lists what a Notation has, it says "It has no Group Kinds." for none, and "Its only Node Kind is context." for one.
   - The schema lets no value be the Kind of a Group whose Notation has none (`not: {}`), since `enum` can't be empty. So the schema fails where validation does, at the Kind.
3. **A context's look.**
   - It's 192 by 64 px, larger than anything an architecture Diagram draws inside a system. A title fits in about 17 characters.
   - Its outline is new, `oval`: an ellipse that touches the Node's rectangle at the middle of each side, where its Ports are, laid out either way. Should its Notation give it Rows, only the header's upper half arches, the sides run straight down past the Rows, and the bottom corners round by 16 px, as a pill's do. The header's contents start 4 px further in at each end, where the ellipse narrows.
   - Its badge is a speech bubble: a context is where one language is spoken.
   - Its hue is `context`, the property `--diagram-hue-context`: #4f55c8 light and #8f96f5 dark.
4. **The Edge Kinds.**
   - `partnership` and `shared-kernel` are symmetric. `upstream-downstream` and `customer-supplier` run from the upstream context to the downstream one. In each pair, the first is solid and the second dashed, so that each of the four looks different. The spec asks only that the symmetric ones have no arrowhead.
   - Their sentence forms are "{from} and {to} are partners", "{from} and {to} share a kernel", "{from} is upstream of {to}" and "{from} supplies {to}".
   - Each may start and end only at a `context`, which shows once issue 4 adds other Node Kinds.
   - The Notation bundles nothing (`none`). Each Edge keeps a line of its own into its Port, so that each end's role tags sit on a line that's that Edge's alone. Issue 4 may want its own Edge Kinds bundled, which would make bundling a matter of the Edge Kind.
   - A symmetric Edge still enters its `to` Node's input Port (issue 2, decision 5). Where a directed Edge enters the same Port, the two share the Port's stub, and the directed Edge's arrowhead sits at its end. Only the chevrons along each Edge's own line, and the dashes, tell the two apart there. Nothing is done about it yet.
5. **Roles in a definition.**
   - A definition's `roles` name each role and give it a `name`, its name in full: `OHS: { name: "open host service" }`. The role's key is what the model holds and what its tag shows, so it's written in capitals.
   - Each Edge Kind's `roles` say what each of its ends may carry: `{ anyOf: [...] }` for any of some roles together, or `{ oneOf: [...] }` for one of them at most. An end it leaves out carries none. So `upstream-downstream` and `customer-supplier` have `from: { anyOf: ["OHS", "PL"] }` and `to: { oneOf: ["CF", "ACL"] }`, and issue 4's Edge Kinds need say nothing to take no roles.
   - `roles` joins the model's optional Edge fields (issue 2, decision 3). A definition lists it exactly when it has roles. The package exports `rolesOf`, `RoleOf`, `RoleDefinition` and `EndRoles`.
6. **Roles in the model and the builder.**
   - An Edge's `roles` is `{ from?: [...], to?: [...] }`, written after `rate`, and `d.edge(a, b, { kind, roles })` takes the same. The builder copies both lists, and records an option of `roles` that it doesn't know, such as `form`, as it records any other (Review 1, decision 5).
   - The types take any of the Notation's roles at either end, so a role the Notation lacks is a type error. A role at the wrong end, or CF beside ACL, is left to validation, as an Edge between Kinds that its Kind doesn't join is.
7. **Validating roles.**
   - A role that the Notation lacks is `unknown-role`, at the role: "Edge `x` has the role `PLS` at its `from` end, which the domain Notation doesn't have. Its roles are OHS, PL, CF and ACL."
   - The rest is one rule, `edge-end-role`, with a message for each case:
     - a role at the wrong end, at the role: "Edge `x` has the role `CF` at its `from` end. An Edge of the Kind `upstream-downstream` may carry `CF` only at its `to` end.";
     - a role that the Kind's ends never carry, at the role: "…may carry only `ISO` or `NRV` there.", or "…carries no roles there.";
     - two roles where the Kind allows one, at the end's list: "Edge `x` has both `CF` and `ACL` at its `to` end. An Edge of the Kind `customer-supplier` may carry only one of them there.";
     - any role on a symmetric Edge, once, at `roles`: "Edge `x` has roles, but its Kind, `partnership`, is symmetric: its two ends are alike, so it takes no roles.";
     - any role on an Edge whose Kind lists none, once, at `roles`: "Edge `x` has roles, but an Edge of the Kind `drain` takes none.";
     - a role listed twice at one end, at the end's list: "Edge `x` lists the role `OHS` twice at its `from` end. List each role once."
   - Roles that list no role are no roles, on any Edge.
   - A symmetric Edge takes no roles whatever its definition says, and a test holds each of the engine's definitions to listing none for one.
   - The schema gives `roles` both lists, of the Notation's roles, each role once. It can't tell which end of which Kind may carry which, and its description names `edge-end-role` among the rules it can't express.
8. **Role tags.**
   - A tag is a box 14 px high, as wide as its role in Inter SemiBold at 10 px with 4 px on each side, to the next even number. It sits on its Edge's line, which runs through it, so that it's plain whose it is. A tag beside the line, as a label is, could belong to either of two lines that run side by side.
   - It sits on a stretch that's the Edge's own, as ticket 10's decision 3 counts them: past the Port's stub, where the Edges that share the Port have parted. The `from` end's tags come first along the route, in the model's order, and the `to` end's last. Each sits as near its end as it has room, 4 px in from the stretch's end, 2 px from the tag before it, with its middle nearer its own end than the other.
   - It keeps 4 px clear of Nodes, callouts' tags and Group labels, and 2 px clear of other tags. Tags are placed in the order of their Edges' ids, as labels are.
   - It hides nothing where it can: no other route and no Group's border passes through it, or within 2 px of it. For that, it may sit to one side of its line, with its edge 4 px past the line. So where two Edges run side by side into one Port, 8 px apart, each one's tag keeps to the outer side of its own line. An end's tags keep to one side together.
   - To hide nothing, a tag goes at most 128 px further from its end than the nearest place it has room. Past that, it's centered on its line at the nearest place clear of Nodes, Group labels and other tags, and covers the routes it must. Without the limit, a tag went to the far side of a corner, beside another Node.
   - A tag with no room at all is drawn anyway, just past its Port's stub or the tag before it, with the warning `role-placement`, at the role: "Edge `x`'s role `OHS` has no room on the Edge's own line near its `from` end, clear of Nodes, Group labels and other role tags. So its tag is drawn there anyway, and may cover them." That happens when two Edges fall back to one simple route, or when a loop and another Edge leave one Port side by side, laid out `down`.
   - Labels are placed after the tags. A label keeps clear of every tag, and the runs it may sit beside leave out what its own Edge's tags take, with 4 px on each side.
   - An Edge's chevrons and its badge keep to the line between its two ends' tags. So the one chevron of a short Edge sits in the middle of the bare line.
   - The scene gives each Edge its `roles`, each with its `end`, its `role`, its `tag` and its `text`, and states the spacing as `roleSpacing: { gap, margin, between }`. Tags count in the drawing's bounds.
9. **Room for tags.** Each gap between ranks leaves room for the tags of the Edges that leave the rank before it, and of those that enter the rank after it: the tags, side by side for `right` and one after another for `down`, 4 px before them, and 12 px after, half of the 24 px of bare line between an Edge's two ends' tags. With OHS and PL at one end and ACL at the other, two contexts stand 160 px apart, from 96.
10. **Tags in the SVG.**
    - They're drawn over the Edges and beneath the labels, in a `<g class="diagram-roles">`. Each tag's `<g>` carries `data-edge-role`, its Edge's id, `data-end` and `data-role`, and holds a rect of class `diagram-role` and its text, of class `diagram-role-text`.
    - The rect is filled with `--diagram-background`, which hides the Edge's line behind the role, and outlined 1 px in `--diagram-edge`, inside the tag, with corners rounded by 3 px. The text is in `--diagram-ink`. No property is new.
    - They aren't inside their Edge's `<g>`, where an Edge drawn later could run over them. So what fades or lights an Edge finds its tags by `data-edge-role`, as it finds its label by `data-edge-label`.
11. **The description.** An end's roles follow its Node's title in parentheses, each by its name in full, after the Row it attaches to, if any: "Catalog (open host service, published language) is upstream of Ordering (conformist): Products." `sentenceOf` makes it, so the web component's list will say the same.
12. **A model without a direction.** A JSON model that leaves `direction` out passed validation and the schema, then crashed layout. Validation now fills in `right`, so that everything after it finds a direction. The SVG is the one that a model which says `right` gets, byte for byte, its metadata included. The schema takes its default from validation.
13. **Fixtures and tests.**
    - `test/fixtures/context-map.ts` draws a shop's seven contexts in either direction, with an Edge of each Kind and every role: two Edges enter one context side by side, three leave it, and a symmetric Edge shares a Port with a directed one. Its golden file is `context-map.svg`, drawn `right`.
    - Both drawings join the tests over every fixture. The one about arrowheads now expects none on a symmetric Edge, which it reads from the fixture's Notation.
    - The properties of role tags run over every fixture too: each sits on its own Edge's line, nearer the end that carries it, after its end's other tags, and clear of Nodes, callouts, Group labels, Edge labels and other tags.
    - The tests' plumbing Notation has roles of its own, with `oneOf` at a `from` end and an Edge Kind that takes a role at one end only. The definitions test keeps the names of the engine's roles out of the core, as it keeps its Kinds' names out.
14. **The skill.**
    - A new section, `## Context maps`, says what differs from an architecture Diagram, and "When a Diagram helps" says which Notation to pick. Its description, and AGENTS.md, name a doc about how bounded contexts relate as a case for reading it.
    - Its example is the package's second one, `docs/example-context-map.diagram.ts`, with its SVG and a doc that shows it. The skill's tests run its commands on both examples, hold each to its module byte for byte, and require it to name every Kind, status and role of every Notation.
15. **Left for later.**
    - Issue 4: the `context` Group Kind, ids local to it, the rule against mixing the two forms, and Rows for aggregates, which adds `rows` to the Notation's fields for contexts too.
    - Issue 7: nothing in the SVG marks a symmetric Edge but its Kind (issue 2, decision 5). The component can look `symmetric` up in the definition that the model's `notation` names, or add a hook.
    - Issue 10: a definition says nothing about flow animation. That issue adds what says that architecture's Edges flow and that domain's don't.
    - The glossary has no entry for a role. The spec's own words, "role" and "role tag", are used as it uses them.
16. **Speed.** On one machine, `pnpm bench` reported 88 ms median drawn `right`, 118 ms drawn `down`, and 377 and 156 ms with every Edge labeled, for the commit this issue started from, and 88, 123, 383 and 157 ms with it. The crowded fixture has no roles.

**Issue 7**

Focus, keyboard selection and the screen-reader lists. This is GitHub's issue #7, not ticket 07 above.

1. **What a Node's focus includes.**
   - Two separate walks start at the Node: one follows Edges upstream, the other downstream. Each follows a symmetric Edge either way, as its Notation's definition says. Cycles and parallel Edges are allowed.
   - The walks keep the Nodes and Edges they reach. They don't change direction at an ancestor or a descendant, so another branch off an ancestor, or another caller of a descendant, stays faded unless a path of its own reaches the selected Node.
2. **Strength.** Unrelated drawing parts show at opacity 0.2; the kept parts stay at 1. An Edge's path, label and role tags share the same strength, using the SVG's hooks. No static SVG or golden file changes.
3. **Hover.** Leaving a Node clears its temporary focus. Escape clears focus even while the pointer stays over the Node; it takes a new hover to focus it again. Listeners leave with the SVG they belong to.
4. **Persistent selection and the host.**
   - A click selects a Node. Hover temporarily takes precedence; leaving it restores the selection. Escape clears both.
   - `PlatformDiagram.selection` is `{ kind: "node" | "edge", id }` or `undefined`. `selectedNode` returns the Node's id, or `undefined`. `selectNode(id)` selects without moving keyboard focus; `selectNode(undefined)` clears. It returns false for an unknown id and leaves the selection alone.
   - A change raises `diagram-select`, which bubbles and is composed, with that target as its `detail`, or `null` when cleared. Re-selecting the same target raises no duplicate event. The component's parts share the same selection and may watch its changes, which details and Walkthroughs can extend.
5. **Edge hover.**
   - The hovered Edge, its label and its role tags stay at full strength, as do its two Nodes; the rest fades. Its label and tags count as hovering the Edge too.
   - An HTML tooltip shows the whole label, the Technology's display name (its slug when unknown) and the rate. It uses text content, wraps inside the stage, and follows the pointer without taking its events. Leaving the Edge or pressing Escape hides it.
   - Each Edge gets a transparent hit path 12 screen pixels wide, made from its existing stroke. It leaves with the SVG, so it never changes the committed drawing or its routing.
6. **Keyboard.**
   - Tab focuses the existing stage. With no selection, keyboard focus selects the first Node in layout order. Arrows choose among Node centers strictly ahead, scoring `ahead + 4 × abs(sideways)`; layout order breaks a tie. With no candidate the selection stays put. With no selection, an arrow starts at the first Node.
   - The selected Node has an accent outline. Selection pans just far enough to show its bounds with 16 screen pixels of room, within the camera's existing limits. Hover doesn't pan.
   - Arrows are handled only on the stage itself. Tab moves through the lists' ordinary buttons; their keys, and the keys of future details controls, retain their own behavior. Ctrl, Meta and Alt combinations are left to the browser. A part can handle Walkthrough keys in the capture phase and prevent the default to keep spatial navigation from handling them.
7. **Layout order.**
   - The component reads each Node's bounds from its SVG group. It sorts their centers along the Diagram's direction first, then across it, with model order settling equal positions. It never runs layout or routing.
   - Edges follow their source Nodes' order, then their target Nodes' order, then model order for parallel Edges and loops. Both directions use the same rule.
8. **The text alternative.**
   - Two ordered lists, named `Nodes` and `Edges`, hold ordinary buttons. Focusing or activating a button selects its Node or Edge. `aria-current` marks the selection. An Edge selection highlights its two Nodes and its own drawing parts, as hover does.
   - A Node's entry is its whole title and its Notation's facts, as in the SVG description, followed by `Rows: name: value; name.` when it has Rows. The Edge entries use `sentenceOf` and the SVG's crossing hook, so roles, Row ends, Technology names, rates and crossing phrases are exactly the SVG description's sentences.
   - The lists are clipped to one pixel rather than hidden, so assistive technology and find-in-page can read them, including titles shortened in the drawing. They become a visible, scrollable text panel while a list button has keyboard focus.
   - In the component the SVG is hidden from assistive technology to avoid a second description. The stage keeps its named `group` role and keyboard instructions. A polite status announces the selected entry while the stage has focus; list buttons announce themselves. The committed SVG retains its own accessible image description.
9. **Explicit highlights.**
   - `PlatformDiagram.setHighlight({ nodes?, edges? })` keeps exactly the listed Node and Edge ids at full strength. It takes precedence over hover and ordinary selection, and doesn't change the selection or raise a selection event. Passing `undefined` gives emphasis back to hover or selection; Escape clears it along with ordinary focus.
   - The parts share that controller as `Stage.highlights`, so a Walkthrough can apply a Step's emphasis through it. Playback, Step controls and details remain their own tickets. Focus writes only its own `--focus-opacity`; it doesn't change animation or a motion setting.
10. **Other drawing parts.** Groups enclosing a kept Node stay at full strength, including nested parents; other Groups fade. A junction stays at full strength when a kept Edge leaves from its Port, Row Ports included. These layers are separate from the Nodes and Edges, so none is faded twice.
11. **Replacement and activation seams.**
    - Selection survives a new SVG that still draws its target id. Removing that id clears selection and raises the clearing event. The lists are rebuilt in the new layout order, and old listeners, hit paths, tooltips and selection marks are removed. Keyboard focus on a list item returns to its selected id after a redraw; if that item is gone it returns to the stage. Disconnecting doesn't restore focus on reconnect.
    - List buttons carry `data-node-item` or `data-edge-item`, each with its target id. A later details part can handle their ordinary click or Enter activation separately from selection changes, just as it can handle the drawing's `data-node` clicks and Enter on the stage.

**Issue 4**

Aggregate diagrams. This is GitHub's issue #4, not ticket 04 above.

1. **The new Kinds.**
   - An aggregate is a Node, as ADR-0005 requires: 256 by 64 px before its Rows, with a heavy framed outline and a badge showing a root and its members. Its hue is `aggregate`, #27694c light and #70cda0 dark.
   - An event is 224 by 48 px, with cut corners, a lightning badge, and the hue `event`, #935619 light and #e8ae68 dark. The sizes leave room for the Rows' entity, value object and invariant names, and for event titles.
   - `references` is dashed, `emits` solid, and `reacts` dotted (`1 4`). All three are directed and take no roles. Their sentences are "{from} references {to}", "{from} emits {to}" and "{from} triggers {to}". Domain bundling stays `none`, so each Edge keeps its own line.
   - The domain Notation now has the `context` Group Kind, a solid border 2 px wide. Its Groups take descriptions and Links. Nodes gain Rows, as issue 3's decision 15 foresaw; fields remain a matter of the Notation, not of each Kind.
2. **Local and full ids.**
   - A Group Kind's `namespace: true` makes its builder prefix local Node and Group ids, and string or Row-object Edge endpoints, with its full id and `/`. Node handles and their Row handles carry full ids already. Full ids are preserved, so validation can report a member from the wrong namespace instead of silently moving it.
   - A builder keeps its own parent and namespace whenever it is called. In particular, `d.node` inside a context callback still declares on the Diagram itself; only the callback's builder declares context members. Local Edge endpoints work before their Nodes are declared. An Edge's default id uses its full endpoints, and an explicit Edge id stays local to the Diagram. Links to ids name full Atlas ids.
   - JSON always holds full ids, including Group membership and Row endpoints. Validation never expands generated JSON. The rule `namespace` rejects a member without its Group's prefix, or with more than one local segment after it.
   - A context's own id has one segment, on either form: `billing`. Its members have two: `billing/order`. Contexts don't nest.
3. **Legal domain forms.**
   - An empty domain Diagram is an empty context map. Otherwise, a context map has only context Nodes and no Groups; an aggregate diagram has exactly one top-level context Group, with its aggregates and events inside it. Only events from other contexts may sit outside, under their two-segment full ids. An aggregate emits events inside its own Group; another context's event may react into it.
   - `domain-form` reports a mix of the two forms, a missing or extra context Group, a local aggregate or event outside it, or emission of another context's event. Endpoint Kinds and roles keep their existing validation rules.
   - A Notation may provide `validation: { rules, check }` for whole-Diagram rules: a pure check after the model, nesting and namespace rules pass, and each rule's meaning for its schema's description. Domain-specific rules and Kind names stay in the domain definition. The schema lists the Kinds and fields and describes the further semantic checks, as it does for endpoint and nesting rules.
4. **Types.** The package exports `DomainGroup`, `DomainGroupKind` and `DomainRow`, alongside the domain types that issue 3 added. An aggregate's handle carries its Rows' literal names, as an architecture Node's does.
5. **The Atlas.**
   - `namespace-home-missing` warns at each borrowed Node's declaration when no valid Diagram draws that full id as a member of its own namespace Group. Merely drawing the context Node, or an empty context Group, doesn't supply the Node's home. The check reads the Group Kind's namespace flag, so no domain Kind is named in the Atlas code. It runs in lint, including staged lint; warnings still exit with 0.
   - The existing index format suffices: a context id's `asNode` lists its context maps, and `asGroup` its aggregate diagrams. An event's `asNode` includes both its own context's Diagram and Diagrams that borrow it. Each id still has one Kind and title across both forms; local ids in different contexts remain distinct full ids. Exporting the index doesn't require a borrowed Node's home, as that is a lint warning.
6. **Fixtures and the skill.**
   - `docs/example-billing.diagram.ts` draws aggregate Rows, each new Edge Kind and Ordering's event outside Billing. `docs/example-ordering.diagram.ts` supplies that event's home. Both have committed SVGs, shown in `docs/example-aggregates.md`. `docs/shared/ordering.ts` defines the context and the event once, for the context map and the aggregate diagrams.
   - `test/fixtures/aggregate.ts` draws the Billing example in either direction, so it joins every fixture-wide property. Its golden is `aggregates.svg`, updated with `pnpm golden:update --project node packages/diagrams/test/golden.test.ts`.
   - The skill's `Aggregate diagrams` section teaches the form, namespaces and borrowed events, with the complete Billing example. Its command test supplies the shared module and the event's already-rendered home, then follows the skill. Every example is still held byte for byte to its source module.
7. **Docs-site themes.** After merging issue 12, `themeColors(notations)` exports the new hues automatically. No change to the site's theme code was needed. The theme's fixture-wide property checks both hues, and the built site's real-browser theme check now draws aggregates as well as architecture, comparing each site theme under both system schemes.

**Issue 12**

The docs site. This is GitHub's issue #12, not ticket 12 above.

1. **The app.**
   - `apps/docs` is the package `@the-platform/docs`, private and unlicensed as the engine is: Astro 7.4.5 with Starlight 0.42.9. From the root, `pnpm docs:dev` serves it, and `pnpm docs:build` builds it into `apps/docs/dist`, as static files. Nothing deploys it yet, so it sets no `site`, and Starlight skips its sitemap with a warning.
   - Its versions are pinned exactly. Starlight is 0.x, where a minor release may break a site. `@astrojs/markdown-satteri` is the version that Astro itself pins, since the site hands Astro a processor made by it. `satteri` is a dev dependency, for the types of its plugins.
   - Astro 7 renders Markdown with Sätteri, not with remark. So the site's Markdown plugins are Sätteri's.
   - Its scripts and its tests turn Astro's telemetry off, so a build sends nothing anywhere.
   - `pnpm typecheck` runs a third program for it, `apps/docs/tsconfig.json`, after `astro sync` has written the types of `astro:content` into `apps/docs/.astro/`, which git ignores. That program has the DOM's types, for the script that the site's pages run and for the tests that look into a browser. The app has no `.astro` files, which `tsc` couldn't check.
2. **Which files are docs.**
   - A doc is `GLOSSARY-MAP.md`, a `GLOSSARY.md`, or a Markdown file anywhere in a `docs` folder: of the repo itself, or of a folder of `apps/` or of `packages/`. A hidden folder holds none, and neither does `node_modules`.
   - So the site shows the glossaries, the ADRs, the specs, the docs in `docs/agents/`, and each package's docs, such as the example system. It doesn't show `AGENTS.md` or the agent skill, which are written for agents.
   - The rule goes by a file's path alone: `isDoc`, in `apps/docs/src/repo.ts`. The site reads only those places, and asks git nothing, unlike the Atlas. A list of places can't reach `repos/`, whatever `.gitignore` says, and a build needs no git.
   - A link, as the file system has them, is never followed: a linked file is no doc, and a linked folder holds none.
   - The app's own pages are in `apps/docs/src/content/docs/`. There's one, the front page, which says what the site is and how to explore a Diagram. Every other page is a file of the repo.
3. **A loader of its own.** `apps/docs/src/repo-docs.ts` loads the pages, in place of Starlight's `docsLoader()` and of Astro's `glob()`.
   - `docsLoader()` reads only `src/content/docs`.
   - `glob()` takes one base folder, which would be the repo's root, and watches all of it. It checks a page's data before it renders the page, so a title can't come from the doc's heading. And it keeps a page's HTML until the doc's own text changes, so a Diagram drawn again wouldn't show.
   - The loader renders every doc each time it runs, which takes a few milliseconds for all of the repo's. It counts a page as changed when its HTML or its data is, so a new title alone counts too.
4. **Ids and URLs.**
   - A doc's id, and so the path of its page, is its path from the root, without `.md`, in lowercase: `packages/diagrams/GLOSSARY.md` is at `/packages/diagrams/glossary/`. Each run of characters other than letters, digits, `.`, `_` and `-` becomes a hyphen, and an `index.md` is its folder's page.
   - Two docs that would be one page stop the build, with a message that names both.
   - `pageOf`, in `repo.ts`, gives a doc's page, for issue #13's Links.
5. **Titles.**
   - A page's title is its doc's first `# Heading`. A Sätteri plugin takes that heading out of the body, since Starlight prints the title itself. A `title` in the doc's frontmatter wins, and a doc with neither is titled by its file's name.
   - The plugin runs after the headings have their ids. So the headings that stay keep the anchors GitHub gives them: the Diagrams glossary's `### Diagrams` is still `#diagrams-1`. The title's own anchor is gone, since Starlight's title is `#_top`.
6. **A doc reads as it does on GitHub.**
   - Smart punctuation is off, so `--` stays two hyphens and quotes stay straight.
   - A relative link to another doc goes to that doc's page, with its fragment. A relative link to any other file of the repo goes to that file on GitHub, on `main`. A link written as a reference, `[text][name]`, is rewritten too, and any other link stays as written. No link is checked.
   - Starlight's own touches are for the repo's docs too (`markdown.processedDirs`), so each heading has a link to itself.
   - Each page's "Edit page" link opens its file on GitHub, and the header links to the repo. The repo's URL and its branch are constants in `repo.ts`.
7. **Diagram images.**
   - A Sätteri plugin, `apps/docs/src/diagrams/images.ts`, replaces each image whose URL is relative and names a `*.diagram.svg` with `<platform-diagram>` around the file's text, byte for byte. An image alone in its paragraph replaces the paragraph, so its Diagram is a block of the page. One within a sentence is replaced where it stands. An image written as a reference, `![Checkout][drawing]`, counts as the image that its definition names.
   - The image's alt text and its title are dropped: the SVG has its own `<title>` and `<desc>`.
   - An SVG that isn't there stops the build, with a message that says to run `diagrams render`.
   - An image with an absolute URL stays an image, since a build fetches nothing.
   - Without JavaScript, Starlight's own CSS fits the inline SVG to the page's width, so the whole drawing shows, small.
8. **The component's script.**
   - An Astro integration, `apps/docs/src/diagrams/integration.ts`, adds a page script, which Vite bundles from the package's `.ts` sources into one file that every page shares: 11 KB, or 5 KB compressed. Every page loads it, with or without a Diagram.
   - The script is `apps/docs/src/diagrams/client.ts`, which imports `@the-platform/diagrams/web-component`. That's where issue #13 gives the component the Atlas index and its Links' URLs, and the integration is where it makes the index.
9. **The theme.**
   - The engine exports `themeColors(notations)`: every color of the theme under the name of its property after `--diagram-`, the shared ones and each Notation's hues, each with both fallbacks. A test checks, over every fixture, that it holds each property that an SVG reads, with the fallbacks the SVG has there.
   - The site writes them all into a `<style>` in every page's head: the dark fallbacks for `:root`, and the light ones for `:root[data-theme="light"]`, which is how Starlight's switch marks its themes. So a Notation that adds a hue is themed without a change to the site.
   - The colors are the engine's own, so a Diagram looks on the site as it does on GitHub in the same theme. In the dark theme its background is a little darker than Starlight's page.
   - Without JavaScript, Starlight's pages stay dark whatever the system asks for, and so do their Diagrams.
   - Each Diagram stands in a frame, a line in `--diagram-border` with rounded corners. In the light theme the drawing's background is the page's, and the frame shows where a drawing wider than the page is cut off, with more to drag into view.
10. **`repos/`.** The site never reads, watches or shows anything in the `repos/` folder at the repo's root.
    - No doc is there (decision 2).
    - A file that a doc embeds, a Diagram or any other picture, must be the repo's own: inside the root and outside `repos/`, both by its path and by where it really is, when a link leads elsewhere. Anything else stops the build, with a message that names the doc and the file. Left alone, Astro would copy such a picture into the site.
    - The dev server watches the docs' own files, each by itself, and never a folder (decision 13). A watched folder would be followed through any link in it.
    - Tests check each of the three, on a sample repo that keeps another project's files in `repos/`, in every place where a doc of ours could be, with links that lead there from among our docs.
    - A link to a file in `repos/` isn't refused. It goes to GitHub, where the file isn't.
11. **Licenses.**
    - `ignoredOptionalDependencies`, in `pnpm-workspace.yaml`, leaves out sharp, Astro's optional image service, and with it libvips, which is LGPL-3.0-or-later. The site uses Astro's pass-through image service instead, which shows a doc's picture as the file it is. A test fails when `sharp` or an `@img/` package is back in the lockfile.
    - Three more licenses count as permissive: BlueOak-1.0.0, 0BSD and CC0-1.0. None asks for more than MIT does. They come with tools that run only in a build: `common-ancestor-path`, `lru-cache` and `sax` (BlueOak-1.0.0), `mdn-data` (CC0-1.0, as Simple Icons is), and `tslib` (0BSD), which only the WebAssembly builds of native packages bring.
    - `lightningcss` is still the one MPL-2.0 package beside the CLI's rasterizer (ticket 01, decision 13). The site's build runs it too, unmodified, through Vite.
    - A test reads the license of every package that pnpm installed, and fails on any other license. It can't read the packages built for other platforms, which aren't installed.
    - Shiki stays. Its MIT package carries a grammar for each language, under that grammar's own license: five are GPL-3.0, among them nginx's, three are MPL-2.0, and some name no license, among them YAML's and TOML's. The site colors code only in the languages that `apps/docs/src/markdown/code-languages.ts` lists: TypeScript, JavaScript, TSX, JSX, JSON, shell, CSS, HTML, XML, diff, SQL and Go. Their grammars, and every grammar those embed, are MIT. Code in any other language shows as plain text, and its grammar is never loaded. The GPL grammars' files are still in `node_modules`, with the rest of the package.
    - The code themes are Starlight's own two, Night Owl's dark and light, which ship in Starlight under MIT. The site names no theme of Shiki's bundle, where `aurora-x` is GPL-3.0.
    - pnpm holds back a release that is less than a day old. Starlight 0.42.9 was 14 hours old when the app was set up, so pnpm wrote it into `minimumReleaseAgeExclude`. The entry can go once the lockfile has moved past that version.
12. **The sidebar.**
    - It groups the docs by where they live. The repo's own come first, under the site's title. Then come each package's and each app's, under its folder's name with a capital, which for a context is the context's name: `Diagrams`.
    - A glossary comes first in its group, as "Glossary", and its docs follow. A `docs` folder is no level of its own, each folder inside it is a group, `adr` is labeled "ADRs", and entries come in path order.
    - It's made from the files when the config is read, and each entry's label is its page's title.
13. **While the site is developed.** Under `astro dev`, the site shows a doc as it's edited, and a Diagram as it's drawn again. It watches each doc, and each Diagram's SVG in the docs' folders.
    - The pages and the sidebar are as they were when the server started. A doc that's added shows at the next start. One that's removed keeps its page until then, since Starlight fails every page over a sidebar entry that has none.
    - A doc that breaks, such as one that embeds a Diagram not yet drawn, logs its error and keeps its last page.
14. **Tests.** On top of the one check that Testing Decisions asks for, the site has a seam of its own: the site as built, or as its dev server sends it, for a sample repo.
    - `DOCS_REPO` names the repo that the site shows. Without it, that's the repo the app is in. A test writes a small repo into a temporary folder, a shop with one context, as seam 2 writes an Atlas, and builds the site for it with Astro's `build()`.
    - The tests read the pages' HTML, and open the pages in Playwright's Chromium, driven from Node, which gets every file from the folder the site was built into. There they follow links, read the sidebar and switch the theme, as a reader does.
    - The theme's check compares pictures. A Diagram zoomed out to its whole drawing must look the same under each of the site's themes, whichever scheme the system asks for, and the two themes must differ. The Diagram draws in every color of the architecture Notation's theme, and the check fails when the site leaves any one of them out.
    - One more build is of the-platform itself. Every doc that git tracks must have its page, under its own title, and the example system's page must hold the committed SVG.
    - The sites are built into `apps/docs/node_modules/.cache/`. Astro writes the module that copies a site's pictures beside the site, and that module must find Astro from there.
    - Every test that builds is in one file, `apps/docs/test/site.test.ts`: two builds of the app at once would share its `.astro/` folder.
    - Astro's dev server answers no request once it finds that Vitest started it, so the tests hide Vitest from it while it starts.
    - `apps/docs/test/licenses.test.ts` holds decision 11's two checks.
    - Together they take about thirteen seconds.
15. **Left for issue #13:** the Atlas index, the Links' URLs, Node URLs and drill-down. Nothing on the site reads the Atlas yet, and a page doesn't say which Diagrams it embeds.

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
