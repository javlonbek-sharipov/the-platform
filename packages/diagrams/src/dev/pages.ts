import type { PreviewUpdate } from "./protocol.ts";

export function diagramUrl(id: string): string {
	return `/diagram?id=${encodeURIComponent(id)}`;
}

/** A preview is a host of the component; exploration stays in the component. */
export function page(
	update: PreviewUpdate,
	drawings: ReadonlyMap<string, string>,
	id?: string,
): string | undefined {
	const drawing =
		id === undefined ? undefined : update.diagrams.find((drawing) => drawing.id === id);
	if (id !== undefined && drawing === undefined) return undefined;
	const title = drawing?.title ?? "Atlas Diagrams";
	return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escapeHtml(title)}</title>
<style>
body { margin: 2rem; font: 16px system-ui; color: #20252d; background: #fff; }
a { color: #285bb3; } platform-diagram { margin-block: 1rem; }
[role="alert"] { position: fixed; inset: auto 1rem 1rem; z-index: 10; padding: 1rem; max-height: 40vh; overflow: auto; white-space: pre-wrap; color: #852124; background: #fff0efee; border: 2px solid #bc3038; }
[role="status"] { white-space: pre-wrap; }
</style>
<body data-revision="${update.revision}"><a href="/">Atlas Diagrams</a><h1>${escapeHtml(title)}</h1>
${drawing === undefined ? `<ul data-diagrams>${update.diagrams.map(({ id, title }) => `<li><a href="${diagramUrl(id)}">${escapeHtml(title)} (${escapeHtml(id)})</a></li>`).join("")}</ul>` : `<platform-diagram>${drawings.get(drawing.id) ?? ""}</platform-diagram>`}
<pre role="alert" hidden></pre><pre role="status"></pre>
<script id="atlas-index" type="application/json">${JSON.stringify(update.index ?? null).replaceAll("<", "\\u003c")}</script>
<script type="module" src="/@diagrams/dev/client.ts"></script>
</body></html>`;
}

function escapeHtml(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
}
