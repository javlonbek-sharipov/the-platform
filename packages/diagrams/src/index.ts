/** The public surface of @the-platform/diagrams: the authoring API and the core. */

export type {
	ArchitectureBuilder,
	ArchitectureNode,
	ArchitectureOptions,
	EdgeEnd,
	EdgeHandle,
	EdgeOptions,
	NodeHandle,
} from "./authoring/architecture.ts";
export { architecture } from "./authoring/architecture.ts";
export type { Diagram, Direction, Edge, Node } from "./authoring/model.ts";
export type { Diagnostic, Severity } from "./core/diagnostics.ts";
export type { RenderOptions, RenderResult } from "./core/render.ts";
export { render } from "./core/render.ts";
export type {
	Box,
	Point,
	Scene,
	SceneEdge,
	SceneNode,
	ScenePort,
	SceneText,
	Side,
} from "./core/scene.ts";
export type { FontData, FontRequest, FontWeight } from "./core/text.ts";
export type { ArchitectureEdgeKind, ArchitectureNodeKind } from "./notations/architecture.ts";
export { architectureEdgeKinds, architectureNodeKinds } from "./notations/architecture.ts";
