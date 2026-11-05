/** The engine's own Notations, each one definition. */

import { architectureNotation } from "./architecture.ts";

/**
 * The Notations a Diagram may be written in, unless the core is given
 * others. A Diagram's `notation` names one of them.
 */
export const notations = [architectureNotation] as const;
