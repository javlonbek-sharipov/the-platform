/** Browser host for the live preview. All exploration belongs to the component. */
import "../web-component/index.ts";
import type { PreviewUpdate } from "./protocol.ts";

const host = document.querySelector("platform-diagram");
const id = new URL(location.href).searchParams.get("id");
const overlay = document.querySelector<HTMLElement>('[role="alert"]');
const warnings = document.querySelector<HTMLElement>('[role="status"]');
const list = document.querySelector("[data-diagrams]");
let revision = Number(document.body.dataset.revision);
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
