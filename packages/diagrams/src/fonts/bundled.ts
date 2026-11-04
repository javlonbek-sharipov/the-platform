/** The bundled Inter fonts, on the Node side. */

import { fileURLToPath } from "node:url";

/** The bundled font's file for each weight that the renderer draws text in. */
export const bundledFontFiles = {
	regular: fileURLToPath(new URL("../../fonts/Inter-Regular.ttf", import.meta.url)),
	semibold: fileURLToPath(new URL("../../fonts/Inter-SemiBold.ttf", import.meta.url)),
};
