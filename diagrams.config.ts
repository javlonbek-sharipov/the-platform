import { atlas } from "@the-platform/diagrams";

/**
 * Marks the repo root as the Atlas: every `*.diagram.ts` in the repo that git
 * doesn't ignore. Each context listed here supplies its glossary's language.
 */
export default atlas({ contexts: { diagrams: { glossary: "packages/diagrams/GLOSSARY.md" } } });
