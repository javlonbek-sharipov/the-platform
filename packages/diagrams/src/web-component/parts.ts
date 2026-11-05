/** The component's parts, in the order they're set up on its stage. */

import { details } from "./details.ts";
import { edgeTooltip } from "./edge-tooltip.ts";
import { flow } from "./flow.ts";
import { focus } from "./focus.ts";
import { fontFaces } from "./font-faces.ts";
import { gestures } from "./gestures.ts";
import { keyboard } from "./keyboard.ts";
import { label } from "./label.ts";
import { levelOfDetail } from "./level-of-detail.ts";
import { readerLists } from "./reader-lists.ts";
import type { Part } from "./stage.ts";
import { termTooltip } from "./term-tooltip.ts";

export const parts: Part[] = [
	fontFaces,
	label,
	gestures,
	levelOfDetail,
	flow,
	focus,
	edgeTooltip,
	termTooltip,
	keyboard,
	readerLists,
	details,
];
