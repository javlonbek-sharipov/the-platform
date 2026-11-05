/** The builder for domain Diagrams, and the types of what it's given. */

import { type DomainNotation, domainNotation } from "../notations/domain.ts";
import {
	type Builder,
	builderOf,
	type DiagramDeclaration,
	type EdgeDeclaration,
	type GroupDeclaration,
	type NodeDeclaration,
	type RowDeclaration,
} from "./builder.ts";

export type DomainOptions = DiagramDeclaration;

/**
 * A Node to declare: a bounded context, an aggregate or a domain event. It's
 * a plain object, so one can be defined once in a shared module, with
 * `satisfies DomainNode`, and declared on several Diagrams.
 */
export type DomainNode = NodeDeclaration<DomainNotation>;

/** The bounded context around an aggregate diagram's Nodes. */
export type DomainGroup = GroupDeclaration<DomainNotation>;

/** An entity, value object or invariant listed on an aggregate. */
export type DomainRow<R extends string = string> = RowDeclaration<R>;

/** What an Edge is declared with, between its two ends. */
export type DomainEdgeOptions = EdgeDeclaration<DomainNotation>;

/** Declares the Nodes, Groups and Edges of a domain Diagram. */
export type DomainBuilder = Builder<DomainNotation>;

/**
 * Builds a domain Diagram. The result is the JSON model itself. Beside it,
 * under keys that JSON leaves out, it records where each declaration was
 * called from, so that the Atlas can point diagnostics at their lines, and an
 * error for each option it doesn't know, so that validation rejects it.
 */
export const domain = builderOf<DomainNotation>(domainNotation);
