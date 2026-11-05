/** The builder for architecture Diagrams, and the types of what it's given. */

import { type ArchitectureNotation, architectureNotation } from "../notations/architecture.ts";
import {
	type Builder,
	builderOf,
	type DiagramDeclaration,
	type EdgeDeclaration,
	type GroupDeclaration,
	type NodeDeclaration,
	type RowDeclaration,
} from "./builder.ts";

export type ArchitectureOptions = DiagramDeclaration;

/**
 * A Node to declare. It's a plain object, so a Node can be defined once in a
 * shared module, with `satisfies ArchitectureNode`, and declared on several
 * Diagrams. Written `as const satisfies ArchitectureNode`, it keeps its Rows'
 * names for the handle that each declaration returns.
 *
 * `R` is the names of its Rows.
 */
export type ArchitectureNode<R extends string = string> = NodeDeclaration<ArchitectureNotation, R>;

/** A Row to declare on a Node, such as `{ name: "replicas", value: "3" }`. */
export type ArchitectureRow<R extends string = string> = RowDeclaration<R>;

/**
 * A Group to declare. Like a Node, it's a plain object, so one definition can
 * serve several Diagrams: a `system` can be a Node on one and a Group on
 * another.
 */
export type ArchitectureGroup = GroupDeclaration<ArchitectureNotation>;

/** What an Edge is declared with, between its two ends. */
export type EdgeOptions = EdgeDeclaration<ArchitectureNotation>;

/**
 * Declares the members of one parent: the Diagram, or a Group. Each Node and
 * Group it declares joins that parent, so each one has exactly one parent by
 * construction. Edges belong to the Diagram, whichever builder declares them.
 */
export type ArchitectureBuilder = Builder<ArchitectureNotation>;

/**
 * Builds an architecture Diagram. The result is the JSON model itself. Beside
 * it, under keys that JSON leaves out, it records where each declaration was
 * called from, so that the Atlas can point diagnostics at their lines, and an
 * error for each option it doesn't know, so that validation rejects it.
 */
export const architecture = builderOf(architectureNotation);
