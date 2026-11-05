/** Pointer-relative tooltip placement, dismissal and lifetime, shared by the hover parts. */

export const tooltipCss = `
[role="tooltip"] {
	position: absolute;
	z-index: 1;
	max-width: min(32rem, calc(100% - 32px));
	box-sizing: border-box;
	padding: 8px 12px;
	border: 1px solid var(--theme-border);
	border-radius: 4px;
	background: var(--theme-surface);
	color: var(--theme-ink);
	font: 13px / 1.5 Helvetica, Arial, sans-serif;
	overflow-wrap: anywhere;
	pointer-events: none;
}
`;

export function createTooltip(parent: HTMLElement, onHide?: () => void) {
	const element = document.createElement("div");
	element.setAttribute("role", "tooltip");
	element.hidden = true;
	parent.append(element);
	const events = new AbortController();
	const { signal } = events;
	const hide = () => {
		element.hidden = true;
		onHide?.();
	};
	parent.addEventListener(
		"keydown",
		(event) => {
			if (event.key === "Escape") hide();
		},
		{ signal },
	);
	return {
		element,
		signal,
		hide,
		position(pointer: PointerEvent | undefined) {
			if (pointer === undefined) return;
			const frame = parent.getBoundingClientRect();
			const { width, height } = element.getBoundingClientRect();
			element.style.left = `${Math.max(8, Math.min(pointer.clientX - frame.left + 12, frame.width - width - 8))}px`;
			element.style.top = `${Math.max(8, Math.min(pointer.clientY - frame.top + 12, frame.height - height - 8))}px`;
		},
		remove() {
			events.abort();
			element.remove();
		},
	};
}
