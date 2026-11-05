/**
 * The component's own style sheet, shared by every `<platform-diagram>` on a
 * page. It lives in each one's shadow root, so the page's styles and the
 * component's never meet.
 */

const css = `
:host {
	display: block;
}
:host([hidden]) {
	display: none;
}
.stage {
	position: relative;
	height: 100%;
	overflow: hidden;
	/* The SVG's own height is worked out from the stage's width. */
	container-type: inline-size;
	/* A finger on the stage moves the drawing, not the page. */
	touch-action: none;
	cursor: grab;
}
/*
 * The SVG fills the stage. Where the page gives the component a height, that
 * is the stage's, and the SVG's. Where it doesn't, the percentages count for
 * nothing, and the SVG is as high as the component sets it: the stage, and
 * the component around it, are then as high as the SVG. It stops short of the
 * window's height, so that the page can always be scrolled past it.
 */
.stage > svg {
	display: block;
	width: 100%;
	min-height: 100%;
	max-height: 100%;
}
`;

export const styles = new CSSStyleSheet();
styles.replaceSync(css);
