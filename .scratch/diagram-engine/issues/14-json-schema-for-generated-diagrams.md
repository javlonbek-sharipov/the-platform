# 14: JSON Schema for generated Diagrams

**What to build:** tool authors can generate Diagrams without writing TypeScript, and can check their output first.

- The package ships a JSON Schema for version 1 of the JSON model.
- A `.diagram.ts` module can default-export a generated JSON file. Generated Diagrams then join the Atlas like any other.

**Blocked by:**

- 05 The Atlas
- 06 Groups
- 07 Architecture Nodes look like what they are
- 08 Rows and Row Ports
- 10 Edge labels, rates and hops

**Status:** ready-for-agent

**Spec:**

- [The JSON model](../spec.md#the-json-model)
- [The authoring API](../spec.md#the-authoring-api): Types and validation

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Schema coverage**

- [ ] The schema covers every field that slice 1 uses:
  - Diagram;
  - Node, with Rows, Technology, External, status, callout and Links;
  - Group;
  - Edge, with Row ends, label, Technology and rate;
  - Link.
- [ ] The schema requires `version` to be `1`.
- [ ] Some rules can't be expressed in JSON Schema, such as ids being unique across the Atlas. The schema's description lists them, and validation enforces them.

**Tests**

- [ ] Every core test fixture's model passes the schema. Check this with a permissively licensed validator, added as a dev dependency.
- [ ] A set of broken models fails both the schema and the core's validation.
- [ ] Text that would make the SVG invalid XML, such as a title holding a control character (U+0007), fails the core's validation with a clear message, and the schema rejects it too.
- [ ] A sample Atlas in the Seam 2 tests has a module that default-exports an imported JSON file. `render` and `lint` treat it like any other Diagram.

## Comments

- Orchestrator: added the control-character checkbox under **Tests**. Ticket 04 found that such a title renders an SVG that isn't valid XML, while lint only warns about the missing glyph.
- Orchestrator: ticket 08's Comments end with a note for this ticket ("For ticket 14"). Read it before you start.
