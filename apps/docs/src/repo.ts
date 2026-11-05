/** The repo that the site shows. */

import { fileURLToPath } from "node:url";

/**
 * The repo's root: the repo this app is in, unless `DOCS_REPO` names another
 * one, as the tests do.
 */
export const repoRoot: string =
	process.env.DOCS_REPO ?? fileURLToPath(new URL("../../../", import.meta.url));
