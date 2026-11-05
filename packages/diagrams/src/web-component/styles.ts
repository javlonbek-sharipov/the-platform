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
}
.stage > svg {
	display: block;
	width: 100%;
	height: 100%;
}
`;

export const styles = new CSSStyleSheet();
styles.replaceSync(css);
