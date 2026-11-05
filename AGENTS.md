## Agent skills

### Issue tracker

Issues and specs live as GitHub issues in `javlonbek-sharipov/the-platform`, through the `gh` CLI. A spec too long for an issue is a file under `docs/specs/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default role names: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context: `GLOSSARY-MAP.md` at the root lists each context's `GLOSSARY.md`. Decisions live in `docs/adr/` (across contexts) and `<context>/docs/adr/`. See `docs/agents/domain.md`.

### Diagrams

Read the `diagrams` skill (`packages/diagrams/skills/diagrams/SKILL.md`) before drawing or editing a Diagram (`*.diagram.ts`), writing a doc that describes how systems talk or how bounded contexts relate, or fixing `diagrams lint`.

## Docs site

`apps/docs` is a Starlight site that shows the repo's own Markdown from where it lives: `GLOSSARY-MAP.md`, each `GLOSSARY.md`, and every `docs/` folder, of the repo and of each package and app. `pnpm docs:dev` serves it, and `pnpm docs:build` builds it into `apps/docs/dist`. An image of a `*.diagram.svg` becomes an explorable `<platform-diagram>` there.

## Reference clones

`repos/` holds gitignored clones of other projects, for reading only. `repos/quorum` is GPL-3.0: take ideas from it, never code. The diagram engine is a clean-room build from `docs/specs/diagram-engine.md`; don't open `repos/quorum` while implementing it.
