# Build the diagram engine clean-room

We build our own diagram engine from the ideas in quorum's board renderer, not from its code. quorum is licensed GPL-3.0-or-later, so copying or porting its code would put our engine under the GPL, and we want to choose our own license. The engine is built from `docs/specs/diagram-engine.md` and the papers it cites, by people and agents who don't open `repos/quorum` while implementing.

## Considered Options

- **Reuse quorum's code**: rejected, because the GPL would then cover our engine.
- **Ask elianiva to relicense**: possible, since elianiva wrote the routing, geometry, and viewport code and nearly all of the board. Not chosen: it depends on their agreement and covers only those files.
- **Build our own from the ideas**: chosen.
