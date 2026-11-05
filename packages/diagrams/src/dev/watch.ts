/** Watch parent folders so an editor's atomic rename doesn't detach the watch. */
import { type FSWatcher, statSync, watch } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

export class Dependencies {
	readonly #files = new Map<string, string>();
	readonly #folders = new Map<string, FSWatcher>();
	readonly #changed: () => void;

	constructor(changed: () => void) {
		this.#changed = changed;
	}

	add(file: string): void {
		file = resolve(file);
		if (this.#files.has(file)) return;
		this.#files.set(file, stamp(file));
		this.#watchParent(file);
	}

	#watchParent(file: string): void {
		let folder = dirname(file);
		while (statSync(folder, { throwIfNoEntry: false })?.isDirectory() !== true) {
			const parent = dirname(folder);
			if (parent === folder) return;
			folder = parent;
		}
		if (this.#folders.has(folder)) return;
		const watcher = watch(folder, (_event, name) => {
			const path = name === null ? undefined : join(folder, String(name));
			if (
				path === undefined ||
				[...this.#files.keys()].some((file) => file === path || file.startsWith(`${path}${sep}`))
			)
				this.check();
		});
		this.#folders.set(folder, watcher);
	}

	/** Also catches a save whose native watch event is still queued. */
	check(): boolean {
		let changed = false;
		for (const [file, before] of this.#files) {
			// A previously missing folder may now exist. Follow it without watching
			// a missing path, and without following symlinks through a whole tree.
			this.#watchParent(file);
			const after = stamp(file);
			if (before !== after) {
				this.#files.set(file, after);
				changed = true;
			}
		}
		if (changed) this.#changed();
		return changed;
	}

	close(): void {
		for (const watcher of this.#folders.values()) watcher.close();
		this.#folders.clear();
	}
}

function stamp(file: string): string {
	const stat = statSync(file, { throwIfNoEntry: false, bigint: true });
	return stat === undefined
		? "missing"
		: `${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
}
