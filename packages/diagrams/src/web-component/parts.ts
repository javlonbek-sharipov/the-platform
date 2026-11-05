/** The component's parts, in the order they're set up on its stage. */

import { flow } from "./flow.ts";
import { fontFaces } from "./font-faces.ts";
import { gestures } from "./gestures.ts";
import { label } from "./label.ts";
import { levelOfDetail } from "./level-of-detail.ts";
import type { Part } from "./stage.ts";

export const parts: Part[] = [fontFaces, label, gestures, levelOfDetail, flow];
