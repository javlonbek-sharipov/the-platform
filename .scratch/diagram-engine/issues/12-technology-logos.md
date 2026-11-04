# 12: Technology logos

**What to build:** readers can see at a glance what each Node and Edge is built with.

- Nodes show their Technology's logo and name in the header.
- Edge labels show the logo beside the Technology.
- Authors get autocompletion for the supported Technologies.
- Any other slug still works, and is shown as its name.

**Blocked by:**

- 07 Architecture Nodes look like what they are
- 10 Edge labels, rates and hops

**Status:** ready-for-agent

**Spec:**

- [Package and tooling](../spec.md#package-and-tooling): Bundled assets
- [Notations › Architecture](../spec.md#architecture)
- [The authoring API](../spec.md#the-authoring-api): Types and validation

**Clean-room:** work only from the spec and the other sources its "Read this first" section allows. Never open `repos/quorum` (ADR-0001).

**Logo table**

- [x] A generated table from Simple Icons (CC0) holds the slug, display name and path data of each supported Technology. Regenerating the table gives the same output.
- [x] The starting set covers common databases, message brokers, languages, runtimes and clouds. Adding a Technology is a one-line change to the generator's list.

**Drawing**

- [x] Logos are drawn in one theme color, in both themes, never in brand colors.
- [x] A title is shortened before it would touch the logo.

**Types**

- [x] `technology` autocompletes the known slugs, but accepts any string.
- [x] An unknown slug shows as its name, and isn't an error.

**Checks**

- [x] Golden files cover:
  - a Node with a logo;
  - a Node with an unknown slug;
  - an Edge label with a logo.
- [x] The example Diagram uses a few logos.

## Comments

- Orchestrator: ticket 10's Comments end with a note for this ticket ("For ticket 12"), on where a label's Technology is laid out. Read it before you start.

**Implementation, 5 November 2026** (branch `t3/add-technology-logos`). Choices the spec left open are recorded in its "Decisions made during implementation", under Ticket 12.

- **Manual check, by eye.** I rendered every Kind with a Technology, alone and with a Row and a status, and the golden fixture and the example, through resvg as `diagrams export` does, at 2× and 3×, in both themes:
  - Each header reads badge, title, logo, then status mark, with the Technology's name small and muted below the title. A slug without a logo, such as `our-own-bus`, shows its name alone, and the title takes the logo's room.
  - A database's risen title first crossed the cylinder's lid. Now each outline says where its face starts, so the title sits under the lid. A test checks that no outline stroke of any Kind crosses the title, the name or the logo.
  - The page's folded corner ends just above a storage Node's logo, clear of it. Logos are in the muted color in both themes, matching the name beside them. Thin logos, such as PostgreSQL's elephant, look lighter than solid ones, such as Kotlin's.
  - In labels, the 12 px logo sits on the Technology's line, before its name: "PostgreSQL • 30/s" with the elephant before it.
  - A logo leaves the title of a 176 px Node 104 px, or 84 px beside a status mark. So in the example, "Orders database" would be shortened, and so would "Payments API", which has a status. The example gives logos only to Nodes whose titles still fit, plus GraphQL and PostgreSQL in two labels, and keeps `grpc` to show a slug drawn by name.
- **Manual check, in an editor's place.** TypeScript 7's language server, asked for completions inside `technology: ""` on an open document, offered all 57 slugs, in `d.node` and in `d.edge`.
- **Manual check, the list.** Adding `meilisearch: "meilisearch"` to the script's list and running it added one entry to the table, and the type check passed. A line for Apache Kafka's icon stopped the script: "Simple Icons' `apachekafka` is under Apache-2.0, not CC0, so its logo can't be bundled." A line for an icon that doesn't exist stopped it too. I reverted all three.
- **What Simple Icons leaves out.** No AWS, Azure, Oracle or IBM icons exist, and Kafka, Cassandra, Pulsar, Rust, PHP, Ruby, JavaScript, Deno and OpenJDK carry licenses other than CC0. Those slugs work, drawn by name. Nobody has checked the logos against each brand's guidelines, which Simple Icons asks its users to follow.
- **Merging ticket 11.** Its description named a Technology by its slug. It now gives the display name, for Nodes as well as Edges. Its every-fixture tests now cover `test/fixtures/technologies.ts` too, and the golden file was redrawn in its look.
- **Speed.** `pnpm bench`: 78 ms median drawn right, 105 ms drawn down.
- **Merging ticket 14.** It had added a Node's `technology` to the model, its validation and its schema, as this ticket had to the model and validation. I kept ticket 14's check and its tests, which cover mine, and dropped my copies. Its every-field fixture's database, "Orders database" with `postgres`, now has a logo that shortens its title, so the fixture calls it "Orders DB".
- **For ticket 15.** The package exports the logo table as `technologies`, and the types `KnownTechnology` and `Technology`. The skill can list the slugs that have a logo, and should say that any other slug works, drawn by name.
- **For ticket 16.** A label's width now counts its logo and the gap after it, in `labelWidth` in `src/core/text.ts`. Placement itself is unchanged.
