import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { type ImportContext, mentionedPeriods, readImport } from "@/lib/import/readReport";
import { readTable } from "@/lib/import/table";

// Reading plants' files into proposed lines (docs/PLAN.md 4.1; D9 to D14). The three sample files are fixtures.

const sample = (name: string) => readFileSync(fileURLToPath(new URL(`../samples/${name}`, import.meta.url)), "utf8");
const P01_FILE = "P01_Chittorgarh_2026-10.csv";
const P04_FILE = "P04_Nalgonda_2026-10.csv";
const P08_FILE = "P08_Paradip_2026-10.csv";

const NIMBUS_PLANTS = [
	{ code: "P01", town: "Chittorgarh" },
	{ code: "P02", town: "Satna" },
	{ code: "P04", town: "Nalgonda" },
	{ code: "P08", town: "Paradip" },
];

function context(code: string, plantType: ImportContext["plantType"], filename: string | null, period = "2026-10") {
	const plant = NIMBUS_PLANTS.find((candidate) => candidate.code === code);
	if (!plant) {
		throw new Error(code);
	}
	return { filename, plantType, period, plant, companyPlants: NIMBUS_PLANTS };
}

const summary = (text: string, ctx: ImportContext) =>
	readImport(text, ctx).rows.map((row) => [row.line, row.itemKey, row.status, row.proposed, row.note, row.questions]);

describe("readTable", () => {
	it("handles quotes, commas and doubled quotes inside quotes, CRLF and a byte-order mark", () => {
		const text = '﻿Item,Qty,Note\r\nCoal,"11,000","said ""approx"", per bill"\r\n"Pet\nCoke",5,\r\n';
		expect(readTable(text)).toEqual([
			{ line: 1, cells: ["Item", "Qty", "Note"] },
			{ line: 2, cells: ["Coal", "11,000", 'said "approx", per bill'] },
			{ line: 3, cells: ["Pet\nCoke", "5", ""] },
		]);
	});

	it("reads cells pasted from Excel, which are tab-separated", () => {
		expect(readTable("Item\tQty\tUnit\nCoal\t1,23,00,000\tkWh")).toEqual([
			{ line: 1, cells: ["Item", "Qty", "Unit"] },
			{ line: 2, cells: ["Coal", "1,23,00,000", "kWh"] },
		]);
	});
});

describe("P01 Chittorgarh's file", () => {
	it("finds the header on line 5 and reads every row ready to fill", () => {
		const mapping = readImport(sample(P01_FILE), context("P01", "INTEGRATED", P01_FILE));
		expect(mapping.headerLine).toBe(5);
		expect(summary(sample(P01_FILE), context("P01", "INTEGRATED", P01_FILE))).toEqual([
			[6, "coal", "READY", { mode: "value", value: "35000", unit: "t" }, null, []],
			[7, "petcoke", "READY", { mode: "value", value: "7600", unit: "t" }, null, []],
			[8, "diesel", "READY", { mode: "value", value: "160000", unit: "L" }, null, []],
			[9, "grid_power", "READY", { mode: "value", value: "4500", unit: "MWh" }, null, []],
			[10, "clinker", "READY", { mode: "value", value: "285800", unit: "t" }, null, []],
		]);
		expect(mapping.warnings).toEqual([]);
	});

	it("warns, without switching, when it is imported into a different month", () => {
		const mapping = readImport(sample(P01_FILE), context("P01", "INTEGRATED", P01_FILE, "2026-09"));
		expect(mapping.warnings).toEqual([
			"This file mentions October 2026, but you are filling September 2026. It will only fill September 2026; check you chose the right file.",
		]);
		expect(mapping.rows.every((row) => row.status === "READY")).toBe(true);
	});
});

describe("P04 Nalgonda's file", () => {
	const mapping = readImport(sample(P04_FILE), context("P04", "INTEGRATED", P04_FILE));

	it("finds the header on line 4 under the report title", () => {
		expect(mapping.headerLine).toBe(4);
	});

	it("matches the plant's own names, keeps the bracketed details and remarks as notes, and reads Indian-grouped numbers", () => {
		expect(summary(sample(P04_FILE), context("P04", "INTEGRATED", P04_FILE))).toEqual([
			[5, "coal", "ASK", { mode: "value", value: "11,000", unit: "t" }, "Imported + Indian", ["MT_UNIT"]],
			[6, "petcoke", "ASK", { mode: "value", value: "1,500", unit: "t" }, null, ["MT_UNIT"]],
			[7, "diesel", "READY", { mode: "value", value: "95", unit: "kL" }, "DG sets + mining fleet", []],
			[8, "grid_power", "READY", { mode: "value", value: "1,23,00,000", unit: "kWh" }, "TSSPDCL; As per bill", []],
			[9, "clinker", "ASK", { mode: "value", value: "1,01,700", unit: "t" }, null, ["MT_UNIT"]],
		]);
	});

	it("asks the owner to confirm MT means tonnes rather than assuming it", () => {
		expect(mapping.rows[0].message).toBe(
			'"MT" usually means metric tonnes. Confirm it means tonnes (t), not million tonnes.',
		);
	});

	it("reads Oct-26 as October 2026 and Nalgonda as P04, so there is nothing to warn about", () => {
		expect(mapping.warnings).toEqual([]);
	});

	it("warns when imported into another plant, and still fills only that plant", () => {
		const intoP01 = readImport(sample(P04_FILE), context("P01", "INTEGRATED", P04_FILE));
		expect(intoP01.warnings).toEqual([
			"This file mentions P04 Nalgonda, but you are filling P01 Chittorgarh. It will only fill P01 Chittorgarh; check you chose the right file.",
		]);
	});
});

describe("P08 Paradip's file", () => {
	it("finds the header on line 3, matches the misspelt grid electricity, and keeps HAG as a note", () => {
		const mapping = readImport(sample(P08_FILE), context("P08", "GRINDING_UNIT", P08_FILE));
		expect(mapping.headerLine).toBe(3);
		expect(summary(sample(P08_FILE), context("P08", "GRINDING_UNIT", P08_FILE))).toEqual([
			[4, "furnace_oil", "READY", { mode: "value", value: "500", unit: "t" }, "HAG", []],
			[5, "diesel", "READY", { mode: "value", value: "60", unit: "kL" }, null, []],
			[6, "grid_power", "READY", { mode: "value", value: "30,60,000", unit: "kWh" }, null, []],
			[7, "clinker", "FIXED_NA", null, null, []],
		]);
		expect(mapping.warnings).toEqual([]);
	});

	it("asks about N/A with no unit at an integrated plant, instead of guessing 0 or a unit", () => {
		const mapping = readImport(sample(P08_FILE), context("P01", "INTEGRATED", P08_FILE));
		const clinker = mapping.rows.find((row) => row.itemKey === "clinker");
		expect(clinker).toMatchObject({
			status: "ASK",
			questions: ["NA_VALUE"],
			proposed: { mode: "na" },
			message: 'The file says "N/A". Mark Clinker produced as N/A, or leave it as it is?',
		});
		expect(mapping.warnings[0]).toContain("This file mentions P08 Paradip");
	});
});

describe("rows that can't fill the form are shown, never dropped", () => {
	const file = [
		"Item,Qty,Unit",
		"Coal,100,t",
		"Limestone,5000,t",
		"Coal,50,t",
		"Diesel,,L",
		"Grid electricity,4500,",
		"Petroleum coke,12,tons",
		"Clinker produced,3,Mt",
		"Furnace oil,1.2345,t",
	].join("\n");
	const rows = readImport(file, context("P01", "INTEGRATED", null)).rows;

	it("keeps every row, with its line number", () => {
		expect(rows.map((row) => row.line)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
	});

	it("explains each one", () => {
		expect(rows.map((row) => [row.itemText, row.status, row.message])).toEqual([
			["Coal", "READY", null],
			["Limestone", "UNMATCHED", 'We don\'t recognise "Limestone". If it belongs in the form, enter it by hand.'],
			["Coal", "INVALID", "Coal is already on line 2. If both rows belong, add them up and enter the total by hand."],
			["Diesel", "NO_QUANTITY", "No quantity given, so this line is left as it is."],
			["Grid electricity", "ASK", "No unit given. Choose the unit for 4500."],
			["Petroleum coke", "INVALID", 'We don\'t recognise the unit "tons".'],
			["Clinker produced", "INVALID", '"Mt" means million tonnes. Monthly figures are in tonnes: write t or MT.'],
			["Furnace oil", "INVALID", "Enter at most 3 decimal places."],
		]);
	});

	it("says clearly when it can't find the table at all", () => {
		const mapping = readImport("Some notes\nwith no table", context("P01", "INTEGRATED", null));
		expect(mapping.rows).toEqual([]);
		expect(mapping.error).toContain("We couldn't find the table in this file.");
	});
});

describe("mentionedPeriods", () => {
	it("reads the ways the samples and filenames write months", () => {
		expect(mentionedPeriods("Monthly Energy & Production Report - Oct-26")).toEqual(["2026-10"]);
		expect(mentionedPeriods("Paradip GU - October 2026")).toEqual(["2026-10"]);
		expect(mentionedPeriods("P01_Chittorgarh_2026-10.csv")).toEqual(["2026-10"]);
		expect(mentionedPeriods("Prepared by,Ravi Meena")).toEqual([]);
	});
});
