import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { applyImport, compareWithForm, pending } from "@/components/months/importMerge";
import { type FormState, initialForm, toLineInput } from "@/components/months/monthForm";
import { readImport } from "@/lib/import/readReport";
import type { MonthLine } from "@/lib/schemas/month";

// Applying an import to the form (docs/PLAN.md 4.3; D9, D13, O10).

const P04_FILE = "P04_Nalgonda_2026-10.csv";
const p04 = readFileSync(fileURLToPath(new URL(`../samples/${P04_FILE}`, import.meta.url)), "utf8");
const mapping = readImport(p04, {
	filename: P04_FILE,
	plantType: "INTEGRATED",
	period: "2026-10",
	plant: { code: "P04", town: "Nalgonda" },
	companyPlants: [{ code: "P04", town: "Nalgonda" }],
});
const UPLOAD = "upload-1";

const blank = (itemKey: MonthLine["itemKey"]): MonthLine => ({
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
const emptyForm = initialForm(["coal", "petcoke", "furnace_oil", "diesel", "grid_power", "clinker"].map(blank));

/** P04's three MT rows are lines 5, 6 and 9. */
const allConfirmed = { 5: "yes", 6: "yes", 9: "yes" };

describe("questions", () => {
	it("fills nothing from an MT row until the owner confirms it means tonnes", () => {
		const comparisons = compareWithForm(mapping.rows, {}, UPLOAD, emptyForm);
		expect(comparisons.map((comparison) => comparison.itemKey)).toEqual(["diesel", "grid_power"]);
		expect(pending(mapping.rows, {}, comparisons, {})).toEqual({ questions: 3, conflicts: 0 });
	});

	it("fills the confirmed rows, and leaves skipped ones as they are", () => {
		const answers = { 5: "yes", 6: "skip", 9: "yes" };
		const comparisons = compareWithForm(mapping.rows, answers, UPLOAD, emptyForm);
		expect(comparisons.map((comparison) => comparison.itemKey)).toEqual(["coal", "diesel", "grid_power", "clinker"]);
		expect(pending(mapping.rows, answers, comparisons, {})).toEqual({ questions: 0, conflicts: 0 });
	});
});

describe("applying to an empty form", () => {
	it("fills each line as the file wrote it, with its note, marked as imported", () => {
		const comparisons = compareWithForm(mapping.rows, allConfirmed, UPLOAD, emptyForm);
		const { form, filled } = applyImport(emptyForm, comparisons, {});
		expect(filled).toEqual(["coal", "petcoke", "diesel", "grid_power", "clinker"]);
		expect(form.coal).toEqual({
			mode: "value",
			value: "11,000",
			unit: "t",
			note: "Imported + Indian",
			uploadId: UPLOAD,
		});
		expect(form.grid_power).toEqual({
			mode: "value",
			value: "1,23,00,000",
			unit: "kWh",
			note: "TSSPDCL; As per bill",
			uploadId: UPLOAD,
		});
		expect(toLineInput("diesel", form.diesel)).toEqual({
			itemKey: "diesel",
			mode: "value",
			value: "95",
			unit: "kL",
			note: "DG sets + mining fleet",
			uploadId: UPLOAD,
		});
		expect(form.furnace_oil).toEqual(emptyForm.furnace_oil);
	});
});

describe("a form that already has values", () => {
	const typed: FormState = {
		...emptyForm,
		diesel: { mode: "value", value: "95000", unit: "L", note: "From the fuel log" },
		grid_power: { mode: "value", value: "12,500", unit: "MWh", note: "" },
	};

	it("treats the same value in another unit as no conflict, and a different value as one", () => {
		const comparisons = compareWithForm(mapping.rows, allConfirmed, UPLOAD, typed);
		const byKey = Object.fromEntries(comparisons.map((comparison) => [comparison.itemKey, comparison.conflict]));
		// 95 kL is 95,000 L; 1,23,00,000 kWh is 12,300 MWh, not 12,500.
		expect(byKey).toMatchObject({ diesel: false, grid_power: true, coal: false });
		expect(pending(mapping.rows, allConfirmed, comparisons, {})).toEqual({ questions: 0, conflicts: 1 });
	});

	it("never overwrites a conflicting value unless the owner picks the file's value", () => {
		const comparisons = compareWithForm(mapping.rows, allConfirmed, UPLOAD, typed);
		expect(applyImport(typed, comparisons, { grid_power: "keep" }).form.grid_power).toEqual(typed.grid_power);
		expect(applyImport(typed, comparisons, {}).form.grid_power).toEqual(typed.grid_power);
		expect(applyImport(typed, comparisons, { grid_power: "imported" }).form.grid_power).toMatchObject({
			value: "1,23,00,000",
			unit: "kWh",
			uploadId: UPLOAD,
		});
	});

	it("keeps the owner's note when the file has none, and takes the file's note when it has one", () => {
		const withNote: FormState = { ...typed, petcoke: { mode: "value", value: "1500", unit: "t", note: "Weighbridge" } };
		const comparisons = compareWithForm(mapping.rows, allConfirmed, UPLOAD, withNote);
		const { form } = applyImport(withNote, comparisons, {});
		// The file's petroleum coke row has no note; its diesel row has "DG sets + mining fleet".
		expect(form.petcoke).toMatchObject({ value: "1,500", note: "Weighbridge", uploadId: UPLOAD });
		expect(form.diesel.note).toBe("DG sets + mining fleet");
	});
});
