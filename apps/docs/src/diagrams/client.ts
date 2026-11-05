/**
 * What every page of the site runs in the browser. It defines
 * `<platform-diagram>`, which makes each Diagram on the page explorable.
 */

import "@the-platform/diagrams/web-component";
import index from "virtual:diagram-atlas";

for (const diagram of document.querySelectorAll("platform-diagram")) {
	diagram.atlasIndex = index;
}
