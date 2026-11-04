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

- [ ] A generated table from Simple Icons (CC0) holds the slug, display name and path data of each supported Technology. Regenerating the table gives the same output.
- [ ] The starting set covers common databases, message brokers, languages, runtimes and clouds. Adding a Technology is a one-line change to the generator's list.

**Drawing**

- [ ] Logos are drawn in one theme color, in both themes, never in brand colors.
- [ ] A title is shortened before it would touch the logo.

**Types**

- [ ] `technology` autocompletes the known slugs, but accepts any string.
- [ ] An unknown slug shows as its name, and isn't an error.

**Checks**

- [ ] Golden files cover:
  - a Node with a logo;
  - a Node with an unknown slug;
  - an Edge label with a logo.
- [ ] The example Diagram uses a few logos.

## Comments

- Orchestrator: ticket 10's Comments end with a note for this ticket ("For ticket 12"), on where a label's Technology is laid out. Read it before you start.
