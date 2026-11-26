/**
 * What changed between two submissions of a month (Flow 3, F1). Compares the lines frozen on each SUBMIT
 * event, so the history shows exactly what the reviewer saw each time.
 */
import { ITEMS } from "@/config/items";
import { formatDecimal } from "@/lib/format";
import type { SubmittedLine } from "@/lib/schemas/report";

export type SubmissionChange = { itemKey: string; label: string; from: string; to: string };

/** How a submitted line reads: the canonical value, so a change of unit alone is not a change. */
export function describeSubmitted(line: SubmittedLine | undefined): string {
	if (!line || line.state === "NOT_ENTERED") {
		return "not entered";
	}
	if (line.state === "NA") {
		return line.naReason === "NOT_USED_THIS_MONTH" ? "not used this month" : "N/A";
	}
	return `${formatDecimal(line.value)} ${line.unit}`;
}

export function diffSubmissions(previous: SubmittedLine[], next: SubmittedLine[]): SubmissionChange[] {
	const changes: SubmissionChange[] = [];
	for (const item of ITEMS) {
		const before = previous.find((line) => line.itemKey === item.key);
		const after = next.find((line) => line.itemKey === item.key);
		const from = describeSubmitted(before);
		const to = describeSubmitted(after);
		if (from !== to) {
			changes.push({ itemKey: item.key, label: item.label, from, to });
		}
		const noteBefore = before?.note ?? "";
		const noteAfter = after?.note ?? "";
		if (noteBefore !== noteAfter) {
			changes.push({
				itemKey: item.key,
				label: `${item.label} note`,
				from: noteBefore || "none",
				to: noteAfter || "none",
			});
		}
	}
	return changes;
}
