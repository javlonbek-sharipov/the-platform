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

**Status:** resolved

**Spec:**

- [The JSON model](../spec.md#the-json-model)
- [The authoring API](../spec.md#the-authoring-api): Types and validation

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Schema coverage**

- [x] The schema covers every field that slice 1 uses:
  - Diagram;
  - Node, with Rows, Technology, External, status, callout and Links;
  - Group;
  - Edge, with Row ends, label, Technology and rate;
  - Link.
- [x] The schema requires `version` to be `1`.
- [x] Some rules can't be expressed in JSON Schema, such as ids being unique across the Atlas. The schema's description lists them, and validation enforces them.

**Tests**

- [x] Every core test fixture's model passes the schema. Check this with a permissively licensed validator, added as a dev dependency.
- [x] A set of broken models fails both the schema and the core's validation.
- [x] Text that would make the SVG invalid XML, such as a title holding a control character (U+0007), fails the core's validation with a clear message, and the schema rejects it too.
- [x] A sample Atlas in the Seam 2 tests has a module that default-exports an imported JSON file. `render` and `lint` treat it like any other Diagram.

## Comments

- Orchestrator: added the control-character checkbox under **Tests**. Ticket 04 found that such a title renders an SVG that isn't valid XML, while lint only warns about the missing glyph.
- Orchestrator: ticket 08's Comments end with a note for this ticket ("For ticket 14"). Read it before you start.

**Implementation, 5 November 2026** (branch `t3/diagram-json-schema`). Choices the spec left open are recorded in its "Decisions made during implementation", under Ticket 14.

- **The schema** is `packages/diagrams/diagram.schema.json`, draft 2020-12, which a tool imports as `@the-platform/diagrams/diagram.schema.json`. Its description lists the rules it can't express, each by the name the core or lint reports it under. A test makes each such rule pass the schema and fail the core, and checks that the description names it.
- **Strict on both sides.** The schema closes every object, so the core now rejects a field the model doesn't have too, as the types do: `` `/edges/1/lable` must be left out: an Edge has no such field. Its fields are `id`, `kind`, `from`, `to`, `label`, `technology` and `rate`. `` Without that, a misspelled field would pass both and quietly not be drawn. A test takes each object's list of fields from that message and compares it with the schema's.
- **Manual check, two more validators.** Python's `jsonschema` 4.26.0 and `@cfworker/json-schema` 4.1.6, installed in throwaway folders, agree with Ajv on 37 models: every fixture, the example, texts with a tab, DEL, U+FFFD, an emoji and a CJK character, and 13 broken models. Python's regex engine differs from JavaScript's in one way that matters: its `$` also matches before a final line break, so a rate `30/s\n` passes the schema there, though the core rejects it. JSON Schema specifies ECMA-262 regular expressions, which Ajv follows, so I left the patterns as they are.
- **Manual check, invalid XML.** Before this ticket, a title holding U+0007 rendered, with only a `glyph-missing` warning that printed the raw BEL. `xmllint` rejects an SVG holding it (`PCDATA invalid Char value 7`). Now the core reports `` Node `api`'s title has a control character, U+0007, which an SVG can't hold. Remove it. `` and draws nothing. `xmllint` accepts the SVGs of the example and of the every-field fixture, `<metadata>` included.
- **Manual check, the real binary.** In a sample Atlas outside the repo, a module that default-exports an imported copy of the every-field fixture rendered and linted clean. `diagrams export --format json` wrote its model with the id the Atlas gives it, and `--format png --scale 2` wrote a 3216 by 640 PNG. By eye, every field shows: Rows, with an Edge from a Row to a Row, the callout, both statuses, the External Node, nested Groups, and labels with their Technology and rate. Node Technologies aren't drawn yet; ticket 12 draws them.
- **Merging ticket 11.** Its `everyFixture()` in `test/support/fixtures.ts` now lists JSON fixtures too, so its properties over every fixture (texts, metadata, casings, chevrons, junctions) cover the generated fixture, and the schema test checks every fixture through it.
- **For ticket 12.** The model's Node has `technology` now. Validation checks that it's a slug (`technology-format`), and the schema covers it. What's left is the authoring API (`ArchitectureNode` and the builder, which doesn't copy it yet) and the drawing.
- **For every ticket that adds a field.** Add it to its type in `src/authoring/model.ts`. The type checker then asks for it in validation's `fields`, and the schema test asks for it in the schema. Add it to `test/fixtures/every-field.json` too. A Node's or Diagram's `description` and Walkthroughs are rejected until a slice reads them, as term Links were already.
- **Slice 2.** The domain Notation needs the schema's `notation`, Kinds and roles, and term Links with their `context`.

Merged into diagram-engine in 7a27f5d.
