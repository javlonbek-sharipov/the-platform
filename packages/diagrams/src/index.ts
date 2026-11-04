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
export type { AtlasConfig } from "./authoring/atlas.ts";
export { atlas } from "./authoring/atlas.ts";
export type {
	Diagram,
	Direction,
	DocLink,
	Edge,
	IdLink,
	Link,
	Node,
} from "./authoring/model.ts";
export type { Diagnostic, Severity } from "./core/diagnostics.ts";
export type { RenderResult } from "./core/render.ts";
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
export type { ArchitectureEdgeKind, ArchitectureNodeKind } from "./notations/architecture.ts";
export { architectureEdgeKinds, architectureNodeKinds } from "./notations/architecture.ts";
