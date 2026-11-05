/**
 * The page that the web component's tests run in: putting a
 * `<platform-diagram>` on it as a page's HTML would, and waiting for the
 * browser to lay it out.
 */

import { afterEach } from "vitest";
import "../../../src/web-component/index.ts";

/** A frame of the browser's rendering: its layout, and whatever watches sizes, have run. */
export async function frame(): Promise<void> {
	await new Promise((resolve) => requestAnimationFrame(resolve));
	await new Promise((resolve) => requestAnimationFrame(resolve));
}

/** Puts an element at the end of the page, until the test is over. */
export function place<T extends Element>(element: T): T {
	const holder = document.createElement("div");
	holder.dataset.test = "holder";
	holder.append(element);
	document.body.append(holder);
	return element;
}

/** The next event of a type that a target dispatches. */
export function next(target: EventTarget, type: string): Promise<Event> {
	return new Promise((resolve) => target.addEventListener(type, resolve, { once: true }));
}

/**
 * Puts HTML at the end of the page, parsed as a page's own HTML is, and
 * gives back its `<platform-diagram>`, once the browser has laid it out.
 */
export async function show(html: string): Promise<HTMLElement> {
	const holder = place(document.createElement("div"));
	holder.insertAdjacentHTML("beforeend", html);
	const diagram = holder.querySelector<HTMLElement>("platform-diagram");
	if (diagram === null) {
		throw new Error("the HTML has no <platform-diagram>");
	}
	await frame();
	return diagram;
}

/** Shows an SVG as the inline child of a `<platform-diagram>` with the style given. */
export function mount(svg: string, style: string): Promise<HTMLElement> {
	return show(`<platform-diagram style="${style}">${svg}</platform-diagram>`);
}

afterEach(() => {
	for (const holder of document.querySelectorAll('[data-test="holder"]')) {
		holder.remove();
	}
	window.scrollTo(0, 0);
});
