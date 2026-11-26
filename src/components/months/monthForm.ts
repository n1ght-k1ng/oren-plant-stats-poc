/**
 * The month form's state and rules, kept out of React so they can be tested. The browser uses the same
 * parsing, conversion and checks as the server (src/lib), so what the data owner sees while typing is what
 * the server will save and freeze (U2).
 */
import { ITEMS, type ItemKey, expectationFor, itemByKey } from "@/config/items";
import type { CheckLines } from "@/lib/checks";
import { toCanonical } from "@/lib/conversion";
import { parseQuantity } from "@/lib/quantity";
import type { LineInput, MonthLine } from "@/lib/schemas/month";

export type PlantType = "INTEGRATED" | "GRINDING_UNIT";

export type FormLine = {
	mode: "value" | "na" | "blank";
	/** As typed. */
	value: string;
	unit: string;
	note: string;
	/** Read-only explanation when N/A was set by the plant type or confirmed as not used. */
	naLabel?: string;
};

export type FormState = Record<ItemKey, FormLine>;

/** The form as loaded from the server. Values show as they were typed, in the unit they were typed in. */
export function initialForm(lines: MonthLine[]): FormState {
	const state = {} as FormState;
	for (const item of ITEMS) {
		const line = lines.find((candidate) => candidate.itemKey === item.key);
		const typedUnit = line?.enteredUnit && (item.formUnits as readonly string[]).includes(line.enteredUnit);
		const base: FormLine = { mode: "blank", value: "", unit: item.canonicalUnit, note: line?.note ?? "" };
		if (line?.state === "VALUE") {
			state[item.key] = typedUnit
				? {
						...base,
						mode: "value",
						value: line.enteredValue ?? line.value ?? "",
						unit: line.enteredUnit ?? item.canonicalUnit,
					}
				: { ...base, mode: "value", value: line.value ?? "", unit: line.unit ?? item.canonicalUnit };
		} else if (line?.state === "NA") {
			state[item.key] = {
				...base,
				mode: "na",
				naLabel: line.naReason === "NOT_USED_THIS_MONTH" ? "Not used this month" : undefined,
			};
		} else {
			state[item.key] = base;
		}
	}
	return state;
}

export type LinePreview =
	| { kind: "value"; canonical: string; unit: string }
	| { kind: "na" }
	| { kind: "blank" }
	| { kind: "error"; message: string };

/** What a line will be saved as, or why it can't be. */
export function previewLine(key: ItemKey, line: FormLine): LinePreview {
	if (line.mode === "na") {
		return { kind: "na" };
	}
	const parsed = parseQuantity(line.value);
	if (line.mode === "blank" || parsed.kind === "blank") {
		return { kind: "blank" };
	}
	if (parsed.kind === "na") {
		return { kind: "na" };
	}
	if (parsed.kind === "invalid") {
		return { kind: "error", message: parsed.message };
	}
	const converted = toCanonical(key, parsed.value, line.unit);
	return converted.ok
		? { kind: "value", canonical: converted.value, unit: converted.unit }
		: { kind: "error", message: converted.message };
}

function sameLine(a: FormLine, b: FormLine): boolean {
	if (a.mode !== b.mode || a.note.trim() !== b.note.trim()) {
		return false;
	}
	return a.mode !== "value" || (a.value.trim() === b.value.trim() && a.unit === b.unit);
}

/** Items the data owner changed since the form was loaded. Only these are sent, so untouched lines stay as they are. */
export function changedItems(current: FormState, loaded: FormState): ItemKey[] {
	return ITEMS.map((item) => item.key).filter((key) => !sameLine(current[key], loaded[key]));
}

export function toLineInput(key: ItemKey, line: FormLine): LineInput {
	return {
		itemKey: key,
		mode: line.mode === "value" && line.value.trim() === "" ? "blank" : line.mode,
		value: line.value,
		unit: line.unit,
		note: line.note.trim() || null,
	};
}

/** The form as the checks see it: unreadable values are left out, as if not entered. */
export function toCheckLines(state: FormState): CheckLines {
	const lines: CheckLines = {};
	for (const item of ITEMS) {
		const preview = previewLine(item.key, state[item.key]);
		lines[item.key] =
			preview.kind === "value"
				? { state: "VALUE", value: preview.canonical }
				: preview.kind === "na"
					? { state: "NA" }
					: { state: "NOT_ENTERED" };
	}
	return lines;
}

export type Readiness = {
	/** Labels of expected items with no value or N/A yet. */
	missing: string[];
	/** Labels of lines that can't be read. */
	unreadable: string[];
	/** Optional items left blank: each needs a one-click "Not used this month" (P4). */
	optionalBlank: ItemKey[];
};

/** What stands between the form and a submission. */
export function readiness(state: FormState, plantType: PlantType): Readiness {
	const result: Readiness = { missing: [], unreadable: [], optionalBlank: [] };
	for (const item of ITEMS) {
		const preview = previewLine(item.key, state[item.key]);
		const expectation = expectationFor(item.key, plantType);
		if (preview.kind === "error") {
			result.unreadable.push(item.label);
		} else if (preview.kind === "blank" && expectation === "OPTIONAL") {
			result.optionalBlank.push(item.key);
		} else if (preview.kind === "blank" && expectation === "EXPECTED") {
			result.missing.push(item.label);
		}
	}
	return result;
}

export function labelOf(key: ItemKey): string {
	return itemByKey(key).label;
}
