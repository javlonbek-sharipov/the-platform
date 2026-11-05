/** The public surface of @the-platform/diagrams: the authoring API and the core. */

export type {
	ArchitectureBuilder,
	ArchitectureGroup,
	ArchitectureNode,
	ArchitectureOptions,
	ArchitectureRow,
	EdgeEnd,
	EdgeHandle,
	EdgeOptions,
	GroupHandle,
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
	Group,
	IdLink,
	Link,
	Node,
	Row,
	RowEnd,
} from "./authoring/model.ts";
export type { Bundling } from "./core/bundles.ts";
export type { Diagnostic, Severity } from "./core/diagnostics.ts";
export type { RenderOptions, RenderResult } from "./core/render.ts";
export { render } from "./core/render.ts";
export type {
	Box,
	Point,
	RoutePoint,
	Scene,
	SceneCallout,
	SceneChevron,
	SceneEdge,
	SceneGroup,
	SceneJunction,
	SceneLabel,
	SceneLogo,
	SceneNode,
	ScenePort,
	SceneRow,
	SceneStatus,
	SceneText,
	Side,
} from "./core/scene.ts";
export type { FontData, FontRequest, FontWeight } from "./core/text.ts";
export type {
	ArchitectureEdgeKind,
	ArchitectureGroupKind,
	ArchitectureNodeKind,
	ArchitectureStatus,
	ArchitectureStatusLook,
	KnownTechnology,
	Technology,
} from "./notations/architecture.ts";
export {
	architectureNotation,
	architectureStatuses,
	architectureStatusLooks,
} from "./notations/architecture.ts";
export type {
	EdgeKindDefinition,
	EdgeKindOf,
	GroupKindDefinition,
	GroupKindOf,
	NodeKindDefinition,
	NodeKindOf,
	Notation,
} from "./notations/notation.ts";
export { edgeKindsOf, groupKindsOf, nodeKindsOf } from "./notations/notation.ts";
export { technologies } from "./notations/technologies.ts";
