# Write Diagrams as TypeScript, compiled to a versioned JSON model

People and agents write each Diagram as a TypeScript module, using a typed API. The module compiles to a JSON model, the one stable, versioned format that the CLI, the web component, and the SVG export read. Types give autocompletion and turn a bad Kind or Port into a compile error, imports let Diagrams share definitions, and tools that generate Diagrams write the JSON directly.

## Considered Options

- **YAML**: simple and safe to parse, but no types and no imports.
- **A custom text syntax**, as Mermaid and D2 have: the nicest to read, but it needs a parser, error messages, and editor support before anything works. It may come later, compiled to the same JSON model.
