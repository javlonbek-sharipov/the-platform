export type Severity = "error" | "warning";

export interface Diagnostic {
	severity: Severity;
	/** A stable name for the rule that raised it, such as `unknown-kind`. */
	rule: string;
	message: string;
	/** A JSON Pointer to the part of the model the diagnostic is about, such as `/nodes/2/kind`. */
	pointer?: string;
}

/** Words as a message lists them: `a, b and c`. */
export function list(words: readonly string[]): string {
	return words.length < 2
		? words.join("")
		: `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** A field's name as one segment of a JSON Pointer, escaped as RFC 6901 says. */
export function pointerSegment(field: string): string {
	return field.replaceAll("~", "~0").replaceAll("/", "~1");
}
