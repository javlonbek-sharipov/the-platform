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

/** A point of an Edge's route. */
export interface RoutePoint extends Point {
	/**
	 * The radius of the arc that rounds the route's corner here, at most half
	 * of either run that meets at the corner. It's zero at the route's ends.
	 */
	radius: number;
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
	/**
	 * The far end of the Port's stub: a short, straight run out of the side,
	 * at a right angle to it. Every Edge at the Port runs along it.
	 */
	stub: Point;
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
	input: ScenePort;
	output: ScenePort;
	title: SceneText;
}

export interface SceneEdge {
	id: string;
	kind: string;
	/** The id of the Node whose output Port the route leaves. */
	from: string;
	/** The id of the Node whose input Port the route enters. */
	to: string;
	/** The Port the route leaves: the `from` Node's output Port. */
	fromPort: ScenePort;
	/** The Port the route enters: the `to` Node's input Port. */
	toPort: ScenePort;
	/**
	 * The route, from the source's Port to the target's: an orthogonal
	 * polyline whose runs take turns between horizontal and vertical, with
	 * every corner rounded.
	 */
	route: RoutePoint[];
	/**
	 * Whether the search found no route, so that the Edge fell back to the
	 * simple route, which may cross Nodes.
	 */
	fellBack: boolean;
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
