declare module "virtual:diagram-atlas" {
	const atlas: {
		index: import("@the-platform/diagrams").AtlasIndex;
		pages: Record<string, import("./pages.ts").SitePage>;
	};
	export default atlas;
}
