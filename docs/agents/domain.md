# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo is **multi-context**. `GLOSSARY-MAP.md` at the root lists each context and where its `GLOSSARY.md` lives. Contexts live next to their code, such as `packages/diagrams/`.

## Before exploring, read these

- **`GLOSSARY-MAP.md`** at the repo root, then the `GLOSSARY.md` of each context relevant to the topic.
- **`docs/adr/`** at the repo root: decisions that span contexts.
- **`<context>/docs/adr/`**: decisions scoped to one context, such as `packages/diagrams/docs/adr/`.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── GLOSSARY-MAP.md
├── docs/adr/                    ← decisions that span contexts
└── packages/
    └── diagrams/
        ├── GLOSSARY.md          ← the Diagrams context
        └── docs/adr/            ← decisions for Diagrams only
```

A new context gets its own `GLOSSARY.md` and `docs/adr/` next to its code, and a line in `GLOSSARY-MAP.md`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
