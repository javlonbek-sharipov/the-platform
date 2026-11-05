/** Walkthrough playback uses the same explicit emphasis as the host and ordinary focus. */

import { endNode, type Walkthrough } from "../authoring/model.ts";
import type { HighlightTargets } from "./highlights.ts";
import type { Part } from "./stage.ts";
import { modelOf } from "./svg.ts";
import { markCss, stepMarks } from "./walkthrough-marks.ts";

/** Time to read a Step's note before playback advances. Manual stepping always pauses. */
const stepTime = 2500;

export const walkthroughs: Part = {
	css: `
.walkthroughs {
	position: absolute;
	right: 12px;
	bottom: 12px;
	max-width: min(26rem, calc(100% - 24px));
	max-height: 45%;
	overflow: auto;
	box-sizing: border-box;
	padding: 12px;
	border: 1px solid var(--theme-border);
	border-radius: 6px;
	background: var(--theme-surface);
	color: var(--theme-ink);
	font: 14px/1.5 Helvetica, Arial, sans-serif;
	cursor: auto;
	touch-action: auto;
}
.walkthroughs p { margin: 0 0 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
.walkthroughs h2 { margin: 0 0 8px; font-size: 16px; }
.walkthroughs ul { list-style: none; margin: 0; padding: 0; }
.walkthroughs button {
	font: inherit;
	color: inherit;
	background: var(--theme-background);
	border: 1px solid var(--theme-border);
	border-radius: 4px;
	padding: 4px 8px;
	cursor: pointer;
}
.walkthroughs button:disabled { opacity: 0.5; cursor: default; }
.walkthroughs button:focus-visible { outline: 2px solid var(--theme-accent); outline-offset: 2px; }
.walkthroughs li + li { margin-top: 4px; }
.walkthrough-controls { display: flex; flex-wrap: wrap; gap: 8px; }
.stage[data-walkthroughs] :is([data-node], [data-group], [data-edge], [data-edge-label], [data-edge-role], [data-from]:not([data-edge])) {
	transition: opacity 180ms ease;
}
${markCss}
`,
	setUp({ element, highlights, onShow }) {
		onShow((svg) => {
			const model = modelOf(svg);
			if (model === undefined || model.walkthroughs.length === 0) return undefined;
			const events = new AbortController();
			const { signal } = events;
			const panel = document.createElement("section");
			panel.className = "walkthroughs";
			panel.setAttribute("aria-label", "Walkthroughs");
			const list = document.createElement("ul");
			list.setAttribute("aria-label", "Walkthroughs");
			const controls = document.createElement("section");
			controls.setAttribute("role", "region");
			controls.setAttribute("aria-label", "Walkthrough");
			controls.hidden = true;
			const title = document.createElement("h2");
			const number = document.createElement("p");
			number.setAttribute("role", "status");
			const note = document.createElement("p");
			note.setAttribute("aria-live", "polite");
			const buttons = document.createElement("div");
			buttons.className = "walkthrough-controls";
			const button = (text: string, parent: Element, action: () => void) => {
				const made = document.createElement("button");
				made.type = "button";
				made.textContent = text;
				made.addEventListener("click", action, { signal });
				parent.append(made);
				return made;
			};
			let active: Walkthrough | undefined;
			let index = 0;
			let playing = false;
			let finished = false;
			let inSight = false;
			let timer: ReturnType<typeof setTimeout> | undefined;
			let previous: HighlightTargets | undefined;
			let owned = highlights.current;
			let opener: HTMLButtonElement | undefined;
			let marks: SVGCircleElement[] = [];
			const clearMarks = () => {
				for (const mark of marks) mark.remove();
				marks = [];
			};
			const stop = () => {
				clearTimeout(timer);
				timer = undefined;
			};
			const update = () => {
				if (active === undefined) return;
				title.textContent = active.title;
				number.textContent = `Step ${index + 1} of ${active.steps.length}`;
				note.textContent = active.steps[index]?.note ?? "";
				note.hidden = note.textContent.length === 0;
				const root = element.getRootNode();
				const focused = root instanceof ShadowRoot ? root.activeElement : null;
				previousButton.disabled = index === 0;
				nextButton.disabled = index === active.steps.length - 1;
				playButton.textContent = playing ? "Pause" : "Play";
				if (
					(focused === previousButton && previousButton.disabled) ||
					(focused === nextButton && nextButton.disabled)
				)
					playButton.focus({ preventScroll: true });
				for (const mark of marks)
					mark.style.animationPlayState = playing && inSight ? "running" : "paused";
			};
			const schedule = () => {
				stop();
				if (playing && inSight)
					timer = setTimeout(() => {
						if (active !== undefined && index + 1 < active.steps.length) {
							index += 1;
							advance();
						} else {
							playing = false;
							finished = true;
							update();
						}
					}, stepTime);
			};
			const advance = () => {
				stop();
				const step = active?.steps[index];
				if (step === undefined) return;
				finished = false;
				clearMarks();
				marks = stepMarks(svg, step);
				const edges =
					step.edges?.map((edge) => (typeof edge === "string" ? edge : edge.edge)) ?? [];
				const nodes =
					step.node === undefined
						? model.edges
								.filter(({ id }) => edges.includes(id))
								.flatMap((edge) => [endNode(edge.from), endNode(edge.to)])
						: [step.node];
				highlights.set({ nodes, edges });
				owned = highlights.current;
				update();
				schedule();
			};
			const move = (delta: number) => {
				if (active === undefined) return;
				playing = false;
				index = Math.max(0, Math.min(active.steps.length - 1, index + delta));
				advance();
			};
			const close = () => {
				stop();
				active = undefined;
				playing = false;
				clearMarks();
				element.removeAttribute("data-walkthrough-open");
				if (highlights.current === owned) highlights.set(previous);
				controls.hidden = true;
				list.hidden = false;
				if (element.isConnected) opener?.focus({ preventScroll: true });
			};
			const previousButton = button("Previous Step", buttons, () => move(-1));
			const playButton = button("Pause", buttons, () => {
				if (active === undefined) return;
				playing = !playing;
				if (playing) {
					if (finished) index = 0;
					advance();
				} else {
					stop();
					update();
				}
			});
			const nextButton = button("Next Step", buttons, () => move(1));
			button("Close Walkthrough", buttons, close);
			for (const walkthrough of model.walkthroughs) {
				const item = document.createElement("li");
				const launch = button(walkthrough.title, item, () => {
					previous =
						highlights.current === undefined
							? undefined
							: { nodes: [...highlights.current.nodes], edges: [...highlights.current.edges] };
					opener = launch;
					active = walkthrough;
					index = 0;
					playing = true;
					list.hidden = true;
					controls.hidden = false;
					element.toggleAttribute("data-walkthrough-open", true);
					advance();
					playButton.focus({ preventScroll: true });
				});
				list.append(item);
			}
			controls.append(title, number, note, buttons);
			panel.append(list, controls);
			element.append(panel);
			element.toggleAttribute("data-walkthroughs", true);
			const visibility = new IntersectionObserver(([entry]) => {
				if (signal.aborted || entry === undefined) return;
				const visible =
					entry.isIntersecting &&
					entry.intersectionRect.width > 0 &&
					entry.intersectionRect.height > 0;
				if (visible === inSight) return;
				inSight = visible;
				update();
				schedule();
			});
			visibility.observe(element);
			element.addEventListener(
				"keydown",
				(event) => {
					if (
						active === undefined ||
						event.defaultPrevented ||
						event.ctrlKey ||
						event.metaKey ||
						event.altKey
					)
						return;
					if (
						event.target instanceof Element &&
						event.target.closest(
							"input, textarea, select, [contenteditable]:not([contenteditable='false'])",
						) !== null
					)
						return;
					if (event.key === "Escape") close();
					else if (event.key === "ArrowRight" || event.key === "ArrowDown") move(1);
					else if (event.key === "ArrowLeft" || event.key === "ArrowUp") move(-1);
					else return;
					event.preventDefault();
				},
				{ capture: true, signal },
			);
			// Controls scroll and take pointer input without starting camera gestures.
			for (const type of ["pointerdown", "wheel"])
				panel.addEventListener(type, (event) => event.stopPropagation(), { signal });
			return () => {
				stop();
				clearMarks();
				events.abort();
				visibility.disconnect();
				if (active !== undefined && highlights.current === owned) highlights.set(previous);
				if (
					element.isConnected &&
					panel.contains(
						element.getRootNode() instanceof ShadowRoot
							? (element.getRootNode() as ShadowRoot).activeElement
							: null,
					)
				)
					element.focus({ preventScroll: true });
				panel.remove();
				element.removeAttribute("data-walkthroughs");
				element.removeAttribute("data-walkthrough-open");
			};
		});
	},
};
