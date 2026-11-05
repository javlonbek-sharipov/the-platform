/** A host may exclude folders even when git doesn't. Check their real destinations before reading. */

import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

function real(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}

export function isExcluded(file: string, folders: readonly string[]): boolean {
	return folders.some((folder) =>
		[resolve(file), real(file)].some((path) =>
			[resolve(folder), real(folder)].some((excluded) => {
				const inside = relative(excluded, path);
				return inside !== ".." && !inside.startsWith(`..${sep}`) && !isAbsolute(inside);
			}),
		),
	);
}
