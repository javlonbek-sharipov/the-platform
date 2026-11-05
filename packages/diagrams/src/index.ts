/** The public surface of @the-platform/diagrams: the authoring API and the core. */

export type {
	ArchitectureBuilder,
	ArchitectureGroup,
	ArchitectureNode,
	ArchitectureOptions,
	ArchitectureRow,
	EdgeOptions,
} from "./authoring/architecture.ts";
export { architecture } from "./authoring/architecture.ts";
export type { AtlasConfig } from "./authoring/atlas.ts";
export { atlas } from "./authoring/atlas.ts";
export type {
	Builder,
	DiagramDeclaration,
	EdgeDeclaration,
	EdgeEnd,
	EdgeHandle,
	GroupDeclaration,
	GroupHandle,
	NodeDeclaration,
	NodeHandle,
	RolesDeclaration,
	RowDeclaration,
	StepDeclaration,
	StepEdgeDeclaration,
	WalkthroughDeclaration,
} from "./authoring/builder.ts";
export { builderOf } from "./authoring/builder.ts";
export type {
	DomainBuilder,
	DomainEdgeOptions,
	DomainGroup,
	DomainNode,
	DomainOptions,
	DomainRow,
} from "./authoring/domain.ts";
export { domain } from "./authoring/domain.ts";
export type {
	Diagram,
	DiagramOf,
	Direction,
	DocLink,
	Edge,
	EdgeOf,
	EdgeRoles,
	Group,
	GroupOf,
	IdLink,
	Link,
	Node,
	NodeOf,
	Row,
	RowEnd,
	Step,
	StepEdge,
	Walkthrough,
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
	SceneFlow,
	SceneGroup,
	SceneJunction,
	SceneLabel,
	SceneLogo,
	SceneNode,
	ScenePort,
	SceneRole,
	SceneRow,
	SceneStatus,
	SceneText,
	Side,
} from "./core/scene.ts";
export type { DiagramSchema, NotationSchema } from "./core/schema.ts";
export { schemaOf } from "./core/schema.ts";
export type { KnownTechnology, Technology } from "./core/technology.ts";
export type { FontData, FontRequest, FontWeight } from "./core/text.ts";
export type { ThemeColor } from "./core/theme.ts";
export { themeColors } from "./core/theme.ts";
export type {
	ArchitectureEdgeKind,
	ArchitectureGroupKind,
	ArchitectureNodeKind,
	ArchitectureNotation,
	ArchitectureStatus,
} from "./notations/architecture.ts";
export { architectureNotation } from "./notations/architecture.ts";
export type {
	DomainEdgeKind,
	DomainGroupKind,
	DomainNodeKind,
	DomainNotation,
	DomainRole,
} from "./notations/domain.ts";
export { domainNotation } from "./notations/domain.ts";
export type {
	EdgeKindDefinition,
	EdgeKindOf,
	EndRoles,
	GroupKindDefinition,
	GroupKindOf,
	NodeKindDefinition,
	NodeKindOf,
	Notation,
	RoleDefinition,
	RoleOf,
	StatusDefinition,
	StatusOf,
} from "./notations/notation.ts";
export {
	edgeKindsOf,
	groupKindsOf,
	nodeKindsOf,
	rolesOf,
	statusesOf,
} from "./notations/notation.ts";
export { notations } from "./notations/notations.ts";
export { technologies } from "./notations/technologies.ts";
