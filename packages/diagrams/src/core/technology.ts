/**
 * Technologies: the product, language or protocol that a Node or an Edge is
 * built with, named by its slug. One in the logo table is drawn as its logo
 * and its display name, and any other as its slug.
 */

import { technologies } from "../notations/technologies.ts";

/** The slug of a Technology that has a logo, which editors offer for `technology`. */
export type KnownTechnology = keyof typeof technologies;

/**
 * A Technology's slug, such as `postgres` or `grpc`. Editors offer the slugs
 * that have a logo, but any slug works: one without a logo is drawn as its
 * name. Intersecting `string` with `{}` keeps the union from widening into
 * plain `string`, which would leave editors nothing to offer.
 */
export type Technology = KnownTechnology | (string & {});

/** Every logo in the logo table is drawn in a square this many units wide. */
export const logoUnits = 24;

const knownTechnologies: ReadonlyMap<string, { name: string; path: string }> = new Map(
	Object.entries(technologies),
);

/**
 * A Technology as it's drawn: with its display name and its logo's path
 * data, when the logo table has it, or else by its slug alone.
 */
export function technologyOf(slug: string): { name: string; logo?: string } {
	const known = knownTechnologies.get(slug);
	return known === undefined ? { name: slug } : { name: known.name, logo: known.path };
}
