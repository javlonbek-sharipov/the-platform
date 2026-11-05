/** Browser host for the live preview. All exploration belongs to the component. */
import "../web-component/index.ts";
import type { AtlasIndex } from "../atlas/types.ts";
import type { DiagramNavigationEvent } from "../web-component/index.ts";
import type { PreviewUpdate } from "./protocol.ts";

const host = document.querySelector("platform-diagram");
const id = new URL(location.href).searchParams.get("id");
const overlay = document.querySelector<HTMLElement>('[role="alert"]');
const warnings = document.querySelector<HTMLElement>('[role="status"]');
const list = document.querySelector("[data-diagrams]");
let revision = Number(document.body.dataset.revision);
let index = JSON.parse(
	document.querySelector("#atlas-index")?.textContent ?? "null",
) as AtlasIndex | null;
if (host !== null) {
	host.atlasIndex = index ?? undefined;
	host.resolveUrl = (target) => {
		const destination =
			typeof target === "string"
				? target
				: target.id === undefined
					? undefined
					: (index?.ids[target.id]?.asGroup[0] ?? index?.ids[target.id]?.asNode[0]);
		if (destination === undefined || !index?.diagrams.some(({ id }) => id === destination))
			return undefined;
		return `/diagram?id=${encodeURIComponent(destination)}${typeof target === "string" ? "" : `&node=${encodeURIComponent(target.id ?? "")}`}`;
	};
	host.addEventListener("diagram-navigate", (event) => {
		const { url } = (event as DiagramNavigationEvent).detail;
		if (url !== undefined) location.assign(url);
	});
	const selected = new URL(location.href).searchParams.get("node");
	if (selected !== null) host.selectNode(selected);
}
const events = new EventSource("/events");
events.addEventListener("update", (event) => {
	const update = JSON.parse(event.data) as PreviewUpdate;
	const text = (severity: "error" | "warning") =>
		update.messages
			.filter((message) => message.severity === severity)
			.map(
				({ file, line, column, message, rule }) =>
					`${[file, line, column].filter((part) => part !== undefined).join(":")}: ${message} (${rule})`,
			)
			.join("\n");
	if (overlay !== null) {
		overlay.textContent = text("error");
		overlay.hidden = overlay.textContent.length === 0;
	}
	if (warnings !== null) warnings.textContent = text("warning");
	index = update.index ?? index;
	if (host !== null) host.atlasIndex = index ?? undefined;
	if (update.revision <= revision) return;
	revision = update.revision;
	if (host !== null) {
		const drawing = update.diagrams.find((drawing) => drawing.id === id);
		if (drawing?.svg !== undefined) {
			const svg = new DOMParser().parseFromString(drawing.svg, "image/svg+xml").documentElement;
			host.append(svg);
		}
	} else if (list !== null) {
		list.replaceChildren(
			...update.diagrams.map(({ id, title }) => {
				const item = document.createElement("li");
				const link = document.createElement("a");
				link.href = `/diagram?id=${encodeURIComponent(id)}`;
				link.textContent = `${title} (${id})`;
				item.append(link);
				return item;
			}),
		);
	}
});
window.addEventListener("pagehide", () => events.close(), { once: true });
