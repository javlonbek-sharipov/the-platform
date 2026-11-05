import { defineCollection } from "astro:content";
import { docsSchema } from "@astrojs/starlight/schema";
import { repoRoot } from "./repo.ts";
import { repoDocs } from "./repo-docs.ts";

export const collections = {
	docs: defineCollection({ loader: repoDocs(repoRoot), schema: docsSchema() }),
};
