/** Flow along an Edge, and its CSS. No clock or platform-dependent logarithm. */

import type { SceneFlow } from "./scene.ts";

/**
 * Rate in events per second. Validation has already checked the format.
 * Clamp before taking the logarithm, including rates too large for a Number.
 */
export function flowOf(rate?: string): SceneFlow {
	const parts = rate?.match(/^(\d+(?:\.\d+)?)([kM]?)\/(s|min|h)$/);
	const multiplier = parts?.[2] === "M" ? 1_000_000 : parts?.[2] === "k" ? 1_000 : 1;
	const divisor = parts?.[3] === "h" ? 3_600 : parts?.[3] === "min" ? 60 : 1;
	const perSecond = parts === undefined ? 0 : (Number(parts?.[1] ?? 0) * multiplier) / divisor;
	const level = binaryLog(1 + Math.min(perSecond, 65_535));
	return { spacing: 96 - 4 * level, speed: 16 + 4 * level };
}

/**
 * log2(value), for values from 1 through 65536. Halving finds its whole part;
 * repeated squaring finds 16 fractional bits. Only the spec's deterministic
 * arithmetic is used, with an error below 1/65536, well below SVG rounding.
 */
function binaryLog(value: number): number {
	let result = 0;
	while (value >= 2) {
		value /= 2;
		result += 1;
	}
	for (let bit = 1 / 2; bit >= 1 / 65_536; bit /= 2) {
		value *= value;
		if (value >= 2) {
			value /= 2;
			result += bit;
		}
	}
	return result;
}

export function flowRules(scope: string): string[] {
	const selector = `.${scope} [data-flow]`;
	return [
		// Rasterizers that read no media queries keep the still drawing underneath.
		`${selector} { display: none; }`,
		"@media (prefers-reduced-motion: no-preference) {",
		`  ${selector} { display: inline; animation-name: ${scope}-flow; animation-timing-function: linear; animation-iteration-count: infinite; }`,
		"}",
		"@media (prefers-reduced-motion: reduce) {",
		`  ${selector} { animation: none; display: none; }`,
		"}",
		`@keyframes ${scope}-flow { from { stroke-dashoffset: 0; } to { stroke-dashoffset: var(--diagram-flow-period, 96px); } }`,
	];
}
