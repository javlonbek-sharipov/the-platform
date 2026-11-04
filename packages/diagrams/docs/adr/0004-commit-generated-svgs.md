# Commit generated SVGs next to their sources

Each `*.diagram.ts` file has its generated `*.diagram.svg` committed beside it, on purpose. GitHub can't run our renderer, so a committed SVG is the only way a Diagram shows up in Markdown on GitHub and in pull request reviews. `lint` fails when an SVG no longer matches its source, so the two can't drift apart. Don't add these SVGs to `.gitignore`.

## Considered Options

- **Build SVGs only in CI** and publish them to the docs site: this keeps generated files out of git, but every Diagram in Markdown on GitHub would be blank.
