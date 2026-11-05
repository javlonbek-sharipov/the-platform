/** Step marks follow the rounded stroke already drawn; no layout or routing runs here. */

import type { Step } from "../authoring/model.ts";

export const markCss = `
@keyframes walkthrough-travel { from { offset-distance: 100%; } to { offset-distance: 0%; } }
[data-walkthrough-edge] {
	pointer-events: none;
	fill: var(--theme-accent);
	stroke: var(--theme-background);
	stroke-width: 1.5px;
	offset-rotate: 0deg;
	offset-distance: 100%;
	animation: walkthrough-travel 1800ms linear both;
}
[data-walkthrough-edge][data-back] {
	offset-distance: 0%;
	animation-direction: reverse;
}
.stage[data-walkthrough-open] [data-flow] { display: none !important; }
`;

/** The writer's stroke runs from `to` to `from`, including each rounded corner and hop. */
export function stepMarks(svg: SVGSVGElement, step: Step): SVGCircleElement[] {
	const edges = [...svg.querySelectorAll<SVGGElement>("[data-edge]")];
	return (step.edges ?? []).flatMap((entry) => {
		const id = typeof entry === "string" ? entry : entry.edge;
		const edge = edges.find((edge) => edge.dataset.edge === id);
		const path = edge?.querySelector("path")?.getAttribute("d");
		if (path === undefined || path === null || edge === undefined) return [];
		const mark = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		mark.dataset.walkthroughEdge = id;
		mark.toggleAttribute("data-back", typeof entry !== "string" && entry.back === true);
		mark.setAttribute("r", "4");
		mark.style.offsetPath = `path(${JSON.stringify(path)})`;
		edge.append(mark);
		return [mark];
	});
}
