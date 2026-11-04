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
- 16 Every label has a run of its own

**Status:** ready-for-agent

**Spec:**

- [Agent skill](../spec.md#agent-skill)
- [Order of work](../spec.md#order-of-work): the skill grows in slices 2 and 4

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Content**

- [x] The skill is short: one screen of essentials, plus one complete example Diagram.
- [x] It is written for agents, and uses only the glossary's words. Follow the writing-for-agents skill when writing it.
- [x] Its example Diagram is a real fixture. A test renders and lints it, so the skill can't drift from the API.

**Placement**

- [x] The skill is exposed where the repo's agents look for skills.
- [x] AGENTS.md lists it.

**Manual check**

- [ ] Once, by hand: give a fresh agent session only the skill and the one-line request "draw the example system with a cache in front of the database".
  - Success means it produces a Diagram that renders and passes lint on its first or second try.
  - Note the result in this ticket's comments.

## Comments

**Implementation, 5 November 2026** (branch `t3/diagram-agent-skill`). Choices the spec left open are recorded in its "Decisions made during implementation", under Ticket 15.

- **Where the skill lives.** `packages/diagrams/skills/diagrams/SKILL.md`. Claude Code finds it as `/diagrams` through `.claude/skills/diagrams`, and Codex as `diagrams` through `.agents/skills/diagrams`. Both are links to the package's folder, and AGENTS.md gives the path. For the manual check, point the fresh agent at that file, or at `/diagrams` in Claude Code.
- **Manual check: still to do.** It needs a fresh agent session, which the orchestrator starts once this merges, so its checkbox stays unticked.
- **A dry run of that request, by me.** In a sample Atlas, I added a cache in front of the example's database, as the skill teaches: `orders-cache`, of Kind `cache`, titled "Orders cache", with the Technology `redis`, between `orders-api` and `orders-db`, and labeled "Reads orders". It rendered and linted without a message on the first try, and its PNG read well. A Node shared through a module, both forms of Link, a callout, `direction: "down"` and the skill's three rates did the same. This isn't the manual check: I wrote the skill, so I can't tell what it leaves out.
- **Found while writing it.** A misspelled option in a diagram module, such as `lable` or `descripton`, renders and lints clean: the builder copies only the options it knows, so the label just isn't drawn. `pnpm typecheck` catches it, so the skill runs it (decision 4). A later ticket could have the builder pass unknown options on to the model, where validation already rejects them as `model-shape`, as it does in generated JSON.
- **For slices 2 and 4.** The skill says the architecture Notation is the only one, and teaches no term Links, namespaces or Walkthroughs. Each slice adds its part to the skill, with an example the tests render and lint, and adds its Notation's Kinds to the naming test in `test/skill.test.ts`.

Merged into diagram-engine in 1b22e93.
