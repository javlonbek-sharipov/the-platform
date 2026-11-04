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
	/** The band that holds the badge and the title: the whole Node, or the part below a person's head. */
	header: Box;
	input: ScenePort;
	output: ScenePort;
	/** Where the Kind's badge is drawn, at the start of the header. */
	badge: Box;
	title: SceneText;
	/** One for each of the Node's Rows, in order, in bands below its header. */
	rows: SceneRow[];
	/** Whether the Node stands for something we don't own or run, drawn with a dashed outline. */
	external: boolean;
	status?: SceneStatus;
	callout?: SceneCallout;
}

/**
 * A Row of a Node: a band across the Node, below its header, with a Port on
 * each side of the Node, whatever the direction.
 */
export interface SceneRow {
	/** The Row's band. */
	box: Box;
	/** Its name, on the left. */
	name: SceneText;
	/** Its value, on the right, if it has one. */
	value?: SceneText;
	/** The Port on the Node's left side, where an Edge that ends at the Row enters. */
	input: ScenePort;
	/** The Port on the Node's right side, where an Edge that starts at the Row leaves. */
	output: ScenePort;
}

/** A Node's status, and where its mark is drawn, at the end of the header. */
export interface SceneStatus {
	value: string;
	mark: Box;
}

/** A Node's callout: a tag just above the Node, holding the callout's text. */
export interface SceneCallout {
	tag: Box;
	text: SceneText;
}

/** A Group's box, with its label band along the top. */
export interface SceneGroup {
	id: string;
	kind: string;
	box: Box;
	/**
	 * The label box: the part of the label band, along the top of the box,
	 * that holds the title. No route passes through it, and no Node comes
	 * within a clearance of it.
	 */
	label: Box;
	/** How deep the Group is nested: 0 on the Diagram itself, 1 inside a Group on it, and so on. */
	depth: number;
	title: SceneText;
}

export interface SceneEdge {
	id: string;
	kind: string;
	/** The id of the Node that the route leaves. */
	from: string;
	/** The name of the Row it leaves from, when the Edge starts at one. */
	fromRow?: string;
	/** The id of the Node that the route enters. */
	to: string;
	/** The name of the Row it enters at, when the Edge ends at one. */
	toRow?: string;
	/**
	 * The Port the route leaves: the `from` Node's output Port, or, when the
	 * Edge starts at one of its Rows, that Row's output Port.
	 */
	fromPort: ScenePort;
	/**
	 * The Port the route enters: the `to` Node's input Port, or, when the Edge
	 * ends at one of its Rows, that Row's input Port.
	 */
	toPort: ScenePort;
	/**
	 * The route, from the source's Port to the target's: an orthogonal
	 * polyline whose runs take turns between horizontal and vertical, with
	 * every corner rounded.
	 */
	route: RoutePoint[];
	/**
	 * The route as it's stroked: in pieces, broken by a short gap at each hop,
	 * where it crosses an Edge with a different target. Each piece is an
	 * orthogonal polyline with its corners' radii, sharp at both ends.
	 */
	stroke: RoutePoint[][];
	/**
	 * Whether the search found no route, so that the Edge fell back to the
	 * simple route, which may cross Nodes.
	 */
	fellBack: boolean;
	/** What the Edge carries, drawn beside its route, when it has a label, a Technology or a rate. */
	label?: SceneLabel;
	/**
	 * The marks that show which way the Edge runs, in order from its target
	 * back to its source. They sit at a fixed spacing back from the target, on
	 * straight stretches of the route, so that the Edges of a bundle share
	 * them along their trunk.
	 */
	chevrons: SceneChevron[];
	/**
	 * Set when the Edge's ends sit in different `region` Groups, or in
	 * different `zone` Groups, since such calls cost latency and egress: which
	 * Kind of Group it crosses between, regions before zones, and where its
	 * badge sits, in the middle of the stretch of its route that's its own.
	 */
	crosses?: { kind: "region" | "zone"; badge: Point };
}

/**
 * An Edge's label: its own text on the first line, and its Technology and
 * its rate on the line below, in a box beside one of the Edge's runs.
 */
export interface SceneLabel {
	box: Box;
	/** The label's own text, if the Edge has one. */
	text?: SceneText;
	/** The Edge's Technology, shown as its name. */
	technology?: SceneText;
	/** The Edge's rate, after its Technology. */
	rate?: SceneText;
}

/**
 * Where the Edges that leave one Port part, so that a mark there shows that
 * they split rather than cross.
 */
export interface SceneJunction {
	point: Point;
	/** The Node whose Port feeds the Edges. */
	node: string;
	/** The Row whose Port it is, when it isn't the Node's header Port. */
	row?: string;
}

/** A direction mark on an Edge's route. */
export interface SceneChevron {
	point: Point;
	/** Which way it points: the unit vector along its run, toward the Edge's target. */
	heading: Point;
}

export interface Scene {
	/** The bounds of the whole drawing, margin included. */
	bounds: Box;
	/**
	 * The margin every Node keeps around it, which no other Node and no Group
	 * label may enter, so that Edges always have a corridor between two Nodes.
	 */
	clearance: number;
	/** The step of the grid that layout snaps every position to. */
	grid: number;
	/**
	 * How Edges that share a corridor spread into lanes: the spacing between
	 * neighboring lanes where there's room, the least they squeeze to in a
	 * narrow corridor, and how far every lane keeps from the corridor's sides.
	 * A corridor holds as many lanes as its width divided by the spacing.
	 */
	lanes: { spacing: number; minimum: number; padding: number };
	/**
	 * How labels keep clear: the gap between a label's box and the line it
	 * sits beside, and the margin it keeps from Nodes, tags, Port stubs, Group
	 * labels and other labels.
	 */
	labelSpacing: { gap: number; margin: number };
	/** The length of the gap a hop leaves in a stroke, centered on the crossing. */
	hop: number;
	nodes: SceneNode[];
	/** The Groups, in model order. */
	groups: SceneGroup[];
	edges: SceneEdge[];
	/** Where the Edges that leave one Port part, Port by Port. */
	junctions: SceneJunction[];
	/** The diagnostics that layout and routing raised. */
	diagnostics: Diagnostic[];
}
