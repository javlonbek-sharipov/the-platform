/**
 * The web component's entry point. Importing it in a page defines
 * `<platform-diagram>`.
 */

import { PlatformDiagram } from "./platform-diagram.ts";

export type { DiagramSelectionEvent, SelectionTarget } from "./selection.ts";
export { PlatformDiagram };

if (customElements.get("platform-diagram") === undefined) {
	customElements.define("platform-diagram", PlatformDiagram);
}

declare global {
	interface HTMLElementTagNameMap {
		"platform-diagram": PlatformDiagram;
	}
}
