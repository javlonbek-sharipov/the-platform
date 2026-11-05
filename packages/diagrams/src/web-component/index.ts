/**
 * The web component's entry point. Importing it in a page defines
 * `<platform-diagram>`.
 */

import { PlatformDiagram } from "./platform-diagram.ts";

export { PlatformDiagram };

if (customElements.get("platform-diagram") === undefined) {
	customElements.define("platform-diagram", PlatformDiagram);
}
