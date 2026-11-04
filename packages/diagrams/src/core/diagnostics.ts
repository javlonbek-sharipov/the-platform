export type Severity = "error" | "warning";

export interface Diagnostic {
	severity: Severity;
	/** A stable name for the rule that raised it, such as `unknown-kind`. */
	rule: string;
	message: string;
	/** A JSON Pointer to the part of the model the diagnostic is about, such as `/nodes/2/kind`. */
	pointer?: string;
}
