/**
 * The scene: the laid-out, routed Diagram as plain data. It doesn't depend on
 * SVG, so another renderer could draw it. It isn't a versioned format.
 */

import type { Diagnostic } from "./diagnostics.ts";
import type { FontWeight } from "./text.ts";

export interface Point {
	x: number;
	y: number;
}

export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

export type Side = "left" | "right" | "top" | "bottom";

export interface ScenePort {
	side: Side;
	/** Where an Edge attaches, on the Node's side. */
	point: Point;
}

/** A piece of text, drawn centered on its point, in the bundled font. */
export interface SceneText {
	text: string;
	point: Point;
	/** Its measured width, which is the width it's drawn at. */
	width: number;
	/** Whether it was shortened to fit, with an ellipsis. The model keeps the full text. */
	shortened: boolean;
	weight: FontWeight;
	/** Its font size. */
	size: number;
}

export interface SceneNode {
	id: string;
	kind: string;
	box: Box;
	/** The band that holds the badge and the title: the whole Node, or the part below a person's head. */
	header: Box;
	input: ScenePort;
	output: ScenePort;
	/** Where the Kind's badge is drawn, at the start of the header. */
	badge: Box;
	title: SceneText;
}

export interface SceneEdge {
	id: string;
	kind: string;
	/** The id of the Node whose output Port the route leaves. */
	from: string;
	/** The id of the Node whose input Port the route enters. */
	to: string;
	/** An orthogonal polyline, from the source's Port to the target's. */
	route: Point[];
}

export interface Scene {
	/** The bounds of the whole drawing, margin included. */
	bounds: Box;
	/**
	 * The margin every Node keeps around it, which no other Node may enter, so
	 * that Edges always have a corridor between two Nodes.
	 */
	clearance: number;
	/** The step of the grid that layout snaps every position to. */
	grid: number;
	nodes: SceneNode[];
	edges: SceneEdge[];
	/** The diagnostics that layout and routing raised. */
	diagnostics: Diagnostic[];
}
