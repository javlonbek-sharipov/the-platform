# Render diagrams as SVG, in a framework-free web component

Every Diagram renders to SVG: interactively inside a web component that needs no framework, and as a self-contained, animated SVG file for Markdown and GitHub. Our Diagrams have at most a few hundred Nodes, so SVG is fast enough, and one renderer then serves both outputs, with sharp text, find-in-page, accessibility, and CSS theming. A plain custom element works in any page, including the Starlight docs site, without tying the pages that embed it to React or another framework.

## Considered Options

- **Canvas or WebGL**, as quorum's board uses: built for thousands of items moving every frame, which our Diagrams don't have, and the static export would need a second renderer.
- **A React component**, or one for another framework: every page that shows a Diagram would have to use that framework.
