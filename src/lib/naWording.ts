/**
 * The one way the app words an item with no figure (docs/UX-REVIEW.md U8, U35): "Not used this month" when the
 * owner confirmed it wasn't used, "N/A" otherwise. Use these everywhere a line is shown, so this month and last
 * month, the audit trail and the change list all read the same.
 */
export type NaReason = "NOT_APPLICABLE" | "NOT_USED_THIS_MONTH";

export const NOT_USED_LABEL = "Not used this month";

/** On its own, as a value in a table: "Not used this month" or "N/A". */
export function naLabel(reason: NaReason | null | undefined): string {
	return reason === "NOT_USED_THIS_MONTH" ? NOT_USED_LABEL : "N/A";
}

/** Inside a sentence, such as "from 600 t to not used this month". */
export function naPhrase(reason: NaReason | null | undefined): string {
	return reason === "NOT_USED_THIS_MONTH" ? NOT_USED_LABEL.toLowerCase() : "N/A";
}
