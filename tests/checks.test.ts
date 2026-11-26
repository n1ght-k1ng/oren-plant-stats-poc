import { describe, expect, it } from "vitest";

import { type CheckInput, type CheckLines, hasWarnings, runChecks } from "@/lib/checks";
import { checkFlags } from "@/lib/schemas/report";

// Plausibility checks (docs/DECISIONS.md P5, P7, U2, U6, C1). Expected figures were worked out independently
// with Python's decimal module.

const value = (amount: string) => ({ state: "VALUE" as const, value: amount });
const NA = { state: "NA" as const };

/** P01 Chittorgarh, October 2026, from samples/, in canonical units. Furnace oil confirmed not used. */
const P01_OCTOBER: CheckInput = {
	plantType: "INTEGRATED",
	period: "2026-10",
	capacityTpa: 4_000_000,
	lines: {
		coal: value("35000"),
		petcoke: value("7600"),
		furnace_oil: NA,
		diesel: value("160000"),
		grid_power: value("4500"),
		clinker: value("285800"),
	},
};

/** P04 Nalgonda, October 2026: 95 KL of diesel is 95000 L, and 1,23,00,000 kWh is 12300 MWh. */
const P04_OCTOBER: CheckInput = {
	plantType: "INTEGRATED",
	period: "2026-10",
	capacityTpa: 2_500_000,
	lines: {
		coal: value("11000"),
		petcoke: value("1500"),
		furnace_oil: NA,
		diesel: value("95000"),
		grid_power: value("12300"),
		clinker: value("101700"),
	},
};

/** P08 Paradip grinding unit, October 2026: 60 kL is 60000 L, 30,60,000 kWh is 3060 MWh, clinker N/A. */
const P08_OCTOBER: CheckInput = {
	plantType: "GRINDING_UNIT",
	period: "2026-10",
	capacityTpa: 1_500_000,
	lines: { furnace_oil: value("500"), diesel: value("60000"), grid_power: value("3060"), clinker: NA },
};

const codes = (input: CheckInput) => runChecks(input).map((flag) => flag.code);

describe("the sample months", () => {
	it("flags P01 twice: fuel energy 4.02 GJ/t and grid power 15.75 kWh/t", () => {
		const flags = runChecks(P01_OCTOBER);
		expect(flags).toEqual([
			{
				code: "KILN_ENERGY",
				severity: "warning",
				itemKeys: ["coal", "petcoke", "furnace_oil", "clinker"],
				message: "Kiln fuel energy is 4.02 GJ per tonne of clinker, outside the expected 2.8 to 3.9.",
				measured: "4.02",
				low: "2.8",
				high: "3.9",
				unit: "GJ/t",
			},
			{
				code: "GRID_PER_CLINKER",
				severity: "warning",
				itemKeys: ["grid_power", "clinker"],
				message: "Grid electricity is 15.75 kWh per tonne of clinker, outside the expected 60 to 130.",
				measured: "15.75",
				low: "60",
				high: "130",
				unit: "kWh/t",
			},
		]);
		expect(hasWarnings(flags)).toBe(true);
	});

	it("does not flag P04 (3.27 GJ/t, 120.94 kWh/t, 0.93 L/t, 47.90% of capacity)", () => {
		expect(runChecks(P04_OCTOBER)).toEqual([]);
	});

	it("does not flag P08, a grinding unit with no clinker", () => {
		expect(runChecks(P08_OCTOBER)).toEqual([]);
	});

	it("produces flags that can be frozen on submission", () => {
		expect(checkFlags.safeParse(runChecks(P01_OCTOBER)).success).toBe(true);
	});
});

describe("range limits", () => {
	const kiln = (petcoke: string): CheckInput => ({
		plantType: "INTEGRATED",
		period: "2026-10",
		capacityTpa: null,
		lines: { coal: value("0"), petcoke: value(petcoke), furnace_oil: NA, clinker: value("100000") },
	});

	it("does not flag a value exactly on the limit", () => {
		// 12000 t × 32.5 GJ/t ÷ 100000 t = exactly 3.9 GJ/t.
		expect(codes(kiln("12000"))).not.toContain("KILN_ENERGY");
	});

	it("flags a value just past it, judging the exact figure, not the rounded one", () => {
		// 12001 t gives 3.900325 GJ/t, which shows as 3.90 but is past the limit.
		const flag = runChecks(kiln("12001")).find((candidate) => candidate.code === "KILN_ENERGY");
		expect(flag).toMatchObject({ measured: "3.9" });
	});
});

describe("clinker compared with capacity in effect that month", () => {
	// 3,650,000 t a year is 10,000 t a day.
	const clinkerOnly = (period: string, capacityTpa: number | null): CheckInput => ({
		plantType: "INTEGRATED",
		period,
		capacityTpa,
		lines: { clinker: value("84000") },
	});

	it("scales by the month's days: 84,000 t is exactly 30% in February 2027 but 27.1% in March", () => {
		expect(codes(clinkerOnly("2027-02", 3_650_000))).toEqual([]);
		expect(runChecks(clinkerOnly("2027-03", 3_650_000))).toMatchObject([
			{ code: "CLINKER_VS_CAPACITY", measured: "27.1", low: "30", high: "110", unit: "%" },
		]);
	});

	it("says so, without warning, when no capacity is on record for the month", () => {
		const flags = runChecks(clinkerOnly("2026-03", null));
		expect(flags).toEqual([
			{
				code: "CAPACITY_UNKNOWN",
				severity: "info",
				itemKeys: ["clinker"],
				message: "No cement capacity is on record for March 2026, so clinker was not compared with it.",
			},
		]);
		expect(hasWarnings(flags)).toBe(false);
	});
});

describe("change from the last approved month", () => {
	const withGrid = (grid: string, previousGrid: string | null): CheckInput => ({
		...P04_OCTOBER,
		lines: { ...P04_OCTOBER.lines, grid_power: value(grid) },
		previous: previousGrid === null ? null : { period: "2026-09", lines: { grid_power: value(previousGrid) } },
	});

	it("flags more than 30% either way", () => {
		expect(runChecks(withGrid("16000", "12300")).find((flag) => flag.code === "LARGE_CHANGE")).toEqual({
			code: "LARGE_CHANGE",
			severity: "warning",
			itemKeys: ["grid_power"],
			message: "Grid electricity changed by +30.08% from September 2026, the last approved month.",
			measured: "30.08",
			low: "-30",
			high: "30",
			unit: "%",
		});
		expect(runChecks(withGrid("8000", "12300")).find((flag) => flag.code === "LARGE_CHANGE")).toMatchObject({
			message: "Grid electricity changed by -34.96% from September 2026, the last approved month.",
		});
	});

	it("does not flag exactly 30%, a first month, or a change from zero", () => {
		expect(codes(withGrid("15990", "12300"))).not.toContain("LARGE_CHANGE");
		expect(codes(withGrid("16000", null))).not.toContain("LARGE_CHANGE");
		expect(codes(withGrid("16000", "0"))).not.toContain("LARGE_CHANGE");
	});
});

describe("items that should not be there, or should", () => {
	it("flags coal or petroleum coke reported at a grinding unit, but not zero", () => {
		const lines: CheckLines = { ...P08_OCTOBER.lines, coal: value("10"), petcoke: value("0") };
		expect(runChecks({ ...P08_OCTOBER, lines })).toMatchObject([
			{ code: "UNEXPECTED_AT_GRINDING_UNIT", itemKeys: ["coal"] },
		]);
	});

	it("flags an expected item marked N/A, but not an optional or fixed one", () => {
		const coalNA = { ...P04_OCTOBER, lines: { ...P04_OCTOBER.lines, coal: NA } };
		const flags = runChecks(coalNA);
		expect(flags.find((flag) => flag.code === "EXPECTED_ITEM_NA")).toEqual({
			code: "EXPECTED_ITEM_NA",
			severity: "warning",
			itemKeys: ["coal"],
			message: "Coal is expected at an integrated plant but is marked N/A. Add a note saying why.",
		});
		// Without its coal, P04's kiln has only 0.48 GJ per tonne of clinker, so that is flagged too.
		expect(flags.map((flag) => flag.code)).toEqual(["KILN_ENERGY", "EXPECTED_ITEM_NA"]);
		// Furnace oil is optional at P04, and clinker is fixed N/A at P08.
		expect(codes(P04_OCTOBER)).toEqual([]);
		expect(codes(P08_OCTOBER)).toEqual([]);
	});

	it("flags kiln fuel burned with no clinker", () => {
		const input: CheckInput = { ...P04_OCTOBER, lines: { ...P04_OCTOBER.lines, clinker: value("0") } };
		expect(codes(input)).toContain("CLINKER_MISSING_WITH_FUEL");
	});
});

describe("a draft being typed", () => {
	it("skips checks whose inputs are not entered yet, rather than treating blanks as 0", () => {
		const halfDone: CheckInput = {
			plantType: "INTEGRATED",
			period: "2026-10",
			capacityTpa: 4_000_000,
			lines: { coal: value("35000"), grid_power: value("4500"), clinker: value("285800") },
		};
		// Petroleum coke and furnace oil are not entered, so fuel energy is not judged yet. Grid power is.
		expect(codes(halfDone)).toEqual(["GRID_PER_CLINKER"]);
	});

	it("runs on an empty month without errors", () => {
		expect(runChecks({ plantType: "INTEGRATED", period: "2026-10", capacityTpa: null, lines: {} })).toEqual([]);
		expect(runChecks({ plantType: "GRINDING_UNIT", period: "2026-10", capacityTpa: null, lines: {} })).toEqual([]);
	});
});
