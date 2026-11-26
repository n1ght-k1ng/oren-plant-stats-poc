import { describe, expect, it } from "vitest";

import {
	type FormState,
	changedItems,
	initialForm,
	previewLine,
	readiness,
	toCheckLines,
	toLineInput,
} from "@/components/months/monthForm";
import { runChecks } from "@/lib/checks";
import type { MonthLine } from "@/lib/schemas/month";

// The month form's rules, shared with the server (docs/PLAN.md 3.3).

const blankLine = (itemKey: MonthLine["itemKey"]): MonthLine => ({
	itemKey,
	state: "NOT_ENTERED",
	value: null,
	unit: null,
	enteredValue: null,
	enteredUnit: null,
	naReason: null,
	note: null,
	source: "FORM",
});

const loaded: MonthLine[] = [
	blankLine("coal"),
	blankLine("petcoke"),
	{ ...blankLine("furnace_oil"), state: "NA", naReason: "NOT_USED_THIS_MONTH" },
	{
		...blankLine("diesel"),
		state: "VALUE",
		value: "95000",
		unit: "L",
		enteredValue: "95",
		enteredUnit: "kL",
		note: "DG sets",
	},
	{
		...blankLine("grid_power"),
		state: "VALUE",
		value: "12300",
		unit: "MWh",
		enteredValue: "1,23,00,000",
		enteredUnit: "KWH",
	},
	blankLine("clinker"),
];

function edit(state: FormState, changes: Partial<FormState>): FormState {
	return { ...state, ...changes };
}

describe("initialForm", () => {
	it("shows values as typed, in the unit typed, when the form offers that unit", () => {
		const form = initialForm(loaded);
		expect(form.diesel).toMatchObject({ mode: "value", value: "95", unit: "kL", note: "DG sets" });
	});

	it("falls back to the canonical value when the typed unit is not one the form offers (for example from an import)", () => {
		expect(initialForm(loaded).grid_power).toMatchObject({ mode: "value", value: "12300", unit: "MWh" });
	});

	it("shows a confirmed not-used item as N/A, labelled", () => {
		expect(initialForm(loaded).furnace_oil).toMatchObject({ mode: "na", naLabel: "Not used this month" });
	});

	it("starts blank items empty, never 0", () => {
		expect(initialForm(loaded).coal).toMatchObject({ mode: "blank", value: "", unit: "t" });
	});
});

describe("previewLine", () => {
	it("shows what will be saved, converted", () => {
		expect(previewLine("diesel", { mode: "value", value: "95", unit: "kL", note: "" })).toEqual({
			kind: "value",
			canonical: "95000",
			unit: "L",
		});
		expect(previewLine("grid_power", { mode: "value", value: "30,60,000", unit: "kWh", note: "" })).toEqual({
			kind: "value",
			canonical: "3060",
			unit: "MWh",
		});
	});

	it("explains a value it can't read", () => {
		expect(previewLine("coal", { mode: "value", value: "1,2,3", unit: "t", note: "" })).toMatchObject({
			kind: "error",
		});
	});

	it("treats an empty value as not entered, and N/A typed into the box as N/A", () => {
		expect(previewLine("coal", { mode: "value", value: " ", unit: "t", note: "" })).toEqual({ kind: "blank" });
		expect(previewLine("coal", { mode: "value", value: "n/a", unit: "t", note: "" })).toEqual({ kind: "na" });
	});
});

describe("changedItems", () => {
	it("lists only what the data owner changed, so untouched lines are not resent", () => {
		const form = initialForm(loaded);
		expect(changedItems(form, form)).toEqual([]);
		const edited = edit(form, {
			coal: { ...form.coal, mode: "value", value: "35000" },
			diesel: { ...form.diesel, note: "DG sets " },
		});
		expect(changedItems(edited, form)).toEqual(["coal"]);
	});
});

describe("toLineInput", () => {
	it("sends an empty value as blank, and trims notes", () => {
		expect(toLineInput("coal", { mode: "value", value: "", unit: "t", note: "  " })).toEqual({
			itemKey: "coal",
			mode: "blank",
			value: "",
			unit: "t",
			note: null,
			uploadId: null,
		});
	});
});

describe("readiness", () => {
	it("lists missing expected items, unreadable lines and blank optional items", () => {
		const form = edit(initialForm(loaded), {
			coal: { mode: "value", value: "abc", unit: "t", note: "" },
			furnace_oil: { mode: "blank", value: "", unit: "t", note: "" },
		});
		expect(readiness(form, "INTEGRATED")).toEqual({
			missing: ["Petroleum coke", "Clinker produced"],
			unreadable: ["Coal"],
			optionalBlank: ["furnace_oil"],
		});
	});
});

describe("live flags", () => {
	it("match the server's checks for the same values", () => {
		const form = edit(initialForm(loaded), {
			coal: { mode: "value", value: "35000", unit: "t", note: "" },
			petcoke: { mode: "value", value: "7600", unit: "t", note: "" },
			diesel: { mode: "value", value: "160000", unit: "L", note: "" },
			grid_power: { mode: "value", value: "4500", unit: "MWh", note: "" },
			clinker: { mode: "value", value: "285800", unit: "t", note: "" },
		});
		const flags = runChecks({
			plantType: "INTEGRATED",
			period: "2026-10",
			capacityTpa: 4_000_000,
			lines: toCheckLines(form),
		});
		expect(flags.map((flag) => [flag.code, flag.measured])).toEqual([
			["KILN_ENERGY", "4.02"],
			["GRID_PER_CLINKER", "15.75"],
		]);
	});
});
