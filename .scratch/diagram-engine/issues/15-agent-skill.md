# 15: Agent skill

**What to build:** every agent writes Diagrams the same way. A short skill in the package teaches agents:

- when a Diagram helps;
- how to write an architecture Diagram with the authoring API;
- how to pick Kinds and ids;
- how to add Rows, Links, labels and Technologies;
- how to finish:
  1. run `diagrams render`;
  2. run `diagrams lint --json` and fix what it reports;
  3. run `diagrams export --format png` and look at the picture;
  4. commit the source and its SVG together.

AGENTS.md points agents to the skill.

**Blocked by:**

- 11 Edges show what they carry, and SVGs describe themselves
- 12 Technology logos
- 13 PNG and JSON export
- 14 JSON Schema for generated Diagrams

**Status:** ready-for-agent

**Spec:**

- [Agent skill](../spec.md#agent-skill)
- [Order of work](../spec.md#order-of-work): the skill grows in slices 2 and 4

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Content**

- [ ] The skill is short: one screen of essentials, plus one complete example Diagram.
- [ ] It is written for agents, and uses only the glossary's words. Follow the writing-for-agents skill when writing it.
- [ ] Its example Diagram is a real fixture. A test renders and lints it, so the skill can't drift from the API.

**Placement**

- [ ] The skill is exposed where the repo's agents look for skills.
- [ ] AGENTS.md lists it.

**Manual check**

- [ ] Once, by hand: give a fresh agent session only the skill and the one-line request "draw the example system with a cache in front of the database".
  - Success means it produces a Diagram that renders and passes lint on its first or second try.
  - Note the result in this ticket's comments.
