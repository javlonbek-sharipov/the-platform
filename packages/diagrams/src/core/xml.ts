/**
 * Writing an SVG's XML as text, deterministically: attributes in the order
 * they're given, numbers with at most two decimals and never a negative zero,
 * and text escaped as XML requires.
 */

export type Attribute = readonly [name: string, value: string | number];

export function start(name: string, attributes: Attribute[]): string {
	return `<${name}${attributesText(attributes)}>`;
}

export function empty(name: string, attributes: Attribute[]): string {
	return `<${name}${attributesText(attributes)}/>`;
}

export function element(name: string, attributes: Attribute[], text: string): string {
	return `<${name}${attributesText(attributes)}>${escapeText(text)}</${name}>`;
}

export function attributesText(attributes: Attribute[]): string {
	return attributes
		.map(([name, value]) => {
			const text = typeof value === "number" ? number(value) : value;
			return ` ${name}="${escapeAttribute(text)}"`;
		})
		.join("");
}

export function indent(depth: number, text: string): string {
	return `${"  ".repeat(depth)}${text}`;
}

/** At most two decimals, and never a negative zero. */
export function number(value: number): string {
	const rounded = Math.round(value * 100) / 100;
	return String(rounded === 0 ? 0 : rounded);
}

function escapeText(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(text: string): string {
	return escapeText(text).replaceAll('"', "&quot;");
}
