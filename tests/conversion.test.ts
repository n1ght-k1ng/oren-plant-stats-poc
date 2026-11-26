import { describe, expect, it } from "vitest";

import { UNIT_ALIASES } from "@/config/units";
import { resolveUnit, toCanonical } from "@/lib/conversion";

// Units as plants write them, and conversion to each item's unit (docs/DECISIONS.md D5, D12, D13, N1).

describe("resolveUnit", () => {
	it.each([
		["t", "t"],
		["MT", "t"],
		["L", "L"],
		["KL", "kL"],
		["kL", "kL"],
		["MWh", "MWh"],
		["kWh", "kWh"],
	])("reads %s from the sample files as %s", (written, unit) => {
		expect(resolveUnit(written)).toEqual({ ok: true, unit });
	});

	it("reads MT as metric tonnes, never as million tonnes", () => {
		expect(resolveUnit("MT")).toEqual({ ok: true, unit: "t" });
		expect(Object.values(UNIT_ALIASES)).not.toContain("Mt");
	});

	it("refuses Mt, explaining that it means million tonnes", () => {
		expect(resolveUnit("Mt")).toEqual({
			ok: false,
			problem: "MILLION_TONNES",
			message: '"Mt" means million tonnes. Monthly figures are in tonnes: write t or MT.',
		});
	});

	it("reports a missing unit, as on P08's clinker row", () => {
		expect(resolveUnit("")).toMatchObject({ ok: false, problem: "MISSING" });
		expect(resolveUnit("  ")).toMatchObject({ ok: false, problem: "MISSING" });
	});

	it("reports an unknown unit instead of guessing, including case variants nobody listed", () => {
		for (const written of ["gallons", "units", "mT", "tons", "GJ"]) {
			expect(resolveUnit(written), written).toMatchObject({ ok: false, problem: "UNKNOWN" });
		}
	});
});

describe("toCanonical", () => {
	it("converts the sample files' values exactly", () => {
		expect(toCanonical("diesel", "95", "KL")).toEqual({ ok: true, value: "95000", unit: "L" });
		expect(toCanonical("diesel", "60", "kL")).toEqual({ ok: true, value: "60000", unit: "L" });
		expect(toCanonical("grid_power", "12300000", "kWh")).toEqual({ ok: true, value: "12300", unit: "MWh" });
		expect(toCanonical("grid_power", "3060000", "kWh")).toEqual({ ok: true, value: "3060", unit: "MWh" });
		expect(toCanonical("coal", "11000", "MT")).toEqual({ ok: true, value: "11000", unit: "t" });
		expect(toCanonical("grid_power", "4500", "MWh")).toEqual({ ok: true, value: "4500", unit: "MWh" });
	});

	it("keeps every digit when dividing", () => {
		expect(toCanonical("grid_power", "1.234", "kWh")).toEqual({ ok: true, value: "0.001234", unit: "MWh" });
		expect(toCanonical("coal", "1", "kg")).toEqual({ ok: true, value: "0.001", unit: "t" });
	});

	it("refuses a unit of the wrong kind for the item", () => {
		expect(toCanonical("diesel", "95", "t")).toEqual({
			ok: false,
			problem: "WRONG_DIMENSION",
			message: "Diesel (HSD) is measured by volume (L or kL), not in tonnes.",
		});
		expect(toCanonical("clinker", "100", "kWh")).toMatchObject({ ok: false, problem: "WRONG_DIMENSION" });
	});

	it("passes on unit problems", () => {
		expect(toCanonical("coal", "11", "Mt")).toMatchObject({ ok: false, problem: "MILLION_TONNES" });
		expect(toCanonical("clinker", "101700", "")).toMatchObject({ ok: false, problem: "MISSING" });
		expect(toCanonical("coal", "11", "tons")).toMatchObject({ ok: false, problem: "UNKNOWN" });
	});
});
