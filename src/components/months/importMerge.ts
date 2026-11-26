/**
 * Turning an import's proposal into form lines (docs/PLAN.md 4.3; D9, D13, O10). Pure, so it can be tested.
 *
 * - Rows that ask a question fill nothing until the owner answers.
 * - A line already holding a different value is never overwritten silently: the owner picks, per field.
 * - Applying only fills the form. Saving and submitting stay with the owner (D9).
 */
import { type ItemKey, itemByKey } from "@/config/items";
import type { ImportResult } from "@/lib/schemas/import";

import { type FormLine, type FormState, previewLine } from "./monthForm";

type Row = ImportResult["mapping"]["rows"][number];

/** The owner's answer to a row's question: a unit (for a blank unit), "yes" (MT means tonnes, or mark N/A), or "skip". */
export type RowAnswer = string;
export type Answers = Record<number, RowAnswer>;
/** Per item with a conflict: keep what the form has, or use the file's value. */
export type Choices = Partial<Record<ItemKey, "keep" | "imported">>;

/** The form line a row would set, or null when it sets nothing (skipped, unanswered, or not usable). */
export function candidateFor(row: Row, answer: RowAnswer | undefined, uploadId: string): FormLine | null {
	if (!row.itemKey || !row.proposed || (row.status !== "READY" && row.status !== "ASK")) {
		return null;
	}
	const note = row.note ?? "";
	if (row.status === "ASK") {
		if (!answer || answer === "skip") {
			return null;
		}
		if (row.questions.includes("BLANK_UNIT") && row.proposed.mode === "value") {
			return { mode: "value", value: row.proposed.value, unit: answer, note, uploadId };
		}
	}
	if (row.proposed.mode === "na") {
		return { mode: "na", value: "", unit: itemByKey(row.itemKey as ItemKey).canonicalUnit, note, uploadId };
	}
	return { mode: "value", value: row.proposed.value, unit: row.proposed.unit ?? "", note, uploadId };
}

/** Whether two lines say the same thing: same state, and the same value once converted. */
function sameMeaning(key: ItemKey, a: FormLine, b: FormLine): boolean {
	const left = previewLine(key, a);
	const right = previewLine(key, b);
	if (left.kind !== right.kind) {
		return false;
	}
	return left.kind !== "value" || (right.kind === "value" && left.canonical === right.canonical);
}

export type Comparison = {
	itemKey: ItemKey;
	line: number;
	current: FormLine;
	imported: FormLine;
	/** True when the form already holds something different: the owner must pick. */
	conflict: boolean;
};

export function compareWithForm(rows: Row[], answers: Answers, uploadId: string, form: FormState): Comparison[] {
	return rows.flatMap((row): Comparison[] => {
		const imported = candidateFor(row, answers[row.line], uploadId);
		if (!imported || !row.itemKey) {
			return [];
		}
		const key = row.itemKey as ItemKey;
		const current = form[key];
		const conflict = current.mode !== "blank" && !sameMeaning(key, current, imported);
		return [{ itemKey: key, line: row.line, current, imported, conflict }];
	});
}

/** Rows still waiting for an answer, and conflicts still waiting for a choice. Apply is blocked until both are 0. */
export function pending(rows: Row[], answers: Answers, comparisons: Comparison[], choices: Choices) {
	return {
		questions: rows.filter((row) => row.status === "ASK" && !answers[row.line]).length,
		conflicts: comparisons.filter((comparison) => comparison.conflict && !choices[comparison.itemKey]).length,
	};
}

/** The form with the import applied, per the owner's answers and choices. Also returns which lines changed. */
export function applyImport(form: FormState, comparisons: Comparison[], choices: Choices) {
	const next: FormState = { ...form };
	const filled: ItemKey[] = [];
	for (const comparison of comparisons) {
		if (comparison.conflict && choices[comparison.itemKey] !== "imported") {
			continue;
		}
		const { current, imported } = comparison;
		next[comparison.itemKey] = { ...imported, note: imported.note || current.note };
		filled.push(comparison.itemKey);
	}
	return { form: next, filled };
}
