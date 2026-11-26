import { describe, expect, it } from "vitest";

import { type Co2Line, calculateCo2, factorValue, formatTonnes } from "@/lib/co2";
import { sumDecimals } from "@/lib/decimal";
import { EMISSION_FACTORS } from "@/lib/factors";
import { approvalLines } from "@/lib/schemas/report";

// CO2 for a month (docs/DECISIONS.md O3, F2, F3, N1, N2, A3, A4). The P01 and P04 figures are the ones
// worked out by hand and confirmed before this code was written.

const value = (amount: string, unit: string): Co2Line => ({ state: "VALUE", value: amount, unit });
const notUsed: Co2Line = { state: "NA", naReason: "NOT_USED_THIS_MONTH" };

const P01_OCTOBER = {
	coal: value("35000", "t"),
	petcoke: value("7600", "t"),
	furnace_oil: notUsed,
	diesel: value("160000", "L"),
	grid_power: value("4500", "MWh"),
	clinker: value("285800", "t"),
};

const P04_OCTOBER = {
	coal: value("11000", "t"),
	petcoke: value("1500", "t"),
	furnace_oil: notUsed,
	diesel: value("95000", "L"),
	grid_power: value("12300", "MWh"),
	clinker: value("101700", "t"),
};

const kgByItem = (result: ReturnType<typeof calculateCo2>) =>
	Object.fromEntries(result.lines.map((line) => [line.itemKey, line.state === "VALUE" ? line.kgCo2 : "N/A"]));

describe("factors", () => {
	it("are exact decimals taken from how they are written", () => {
		expect(factorValue("diesel").toFixed()).toBe("2.68");
		for (const factor of EMISSION_FACTORS) {
			expect(factorValue(factor.key).toFixed(), factor.key).toBe(String(factor.kgCo2PerUnit));
			expect(String(factor.kgCo2PerUnit), factor.key).toMatch(/^\d+(\.\d{1,2})?$/);
		}
	});
});

describe("P01 Chittorgarh, October 2026", () => {
	const result = calculateCo2(P01_OCTOBER);

	it("gives each line's kg CO2", () => {
		expect(kgByItem(result)).toEqual({
			coal: "85435000",
			petcoke: "24084400",
			furnace_oil: "N/A",
			diesel: "428800",
			grid_power: "3037500",
			clinker: "150045000",
		});
	});

	it("puts diesel and calcination in Scope 1 and grid power alone in Scope 2", () => {
		expect(result.scope1KgCo2).toBe("259993200");
		expect(result.scope2KgCo2).toBe("3037500");
		expect(result.totalKgCo2).toBe("263030700");
	});

	it("shows 2,59,993.2 t, 3,037.5 t and 2,63,030.7 t", () => {
		expect(formatTonnes(result.scope1KgCo2)).toBe("2,59,993.2");
		expect(formatTonnes(result.scope2KgCo2)).toBe("3,037.5");
		expect(formatTonnes(result.totalKgCo2)).toBe("2,63,030.7");
	});
});

describe("P04 Nalgonda, October 2026", () => {
	const result = calculateCo2(P04_OCTOBER);

	it("gives each line's kg CO2", () => {
		expect(kgByItem(result)).toEqual({
			coal: "26851000",
			petcoke: "4753500",
			furnace_oil: "N/A",
			diesel: "254600",
			grid_power: "8302500",
			clinker: "53392500",
		});
	});

	it("totals 85,251.6 t in Scope 1 and 8,302.5 t in Scope 2", () => {
		expect(result.scope1KgCo2).toBe("85251600");
		expect(result.scope2KgCo2).toBe("8302500");
		expect(result.totalKgCo2).toBe("93554100");
		expect(formatTonnes(result.scope1KgCo2)).toBe("85,251.6");
		expect(formatTonnes(result.scope2KgCo2)).toBe("8,302.5");
		expect(formatTonnes(result.totalKgCo2)).toBe("93,554.1");
	});
});

describe("what each approval line records (F2, F3)", () => {
	const result = calculateCo2(P04_OCTOBER);
	const line = (key: string) => result.lines.find((candidate) => candidate.itemKey === key);

	it("records the factor's value, source and year with every line", () => {
		expect(line("diesel")).toMatchObject({
			value: "95000",
			unit: "L",
			kgCo2PerUnit: "2.68",
			factorYear: "2006",
			scope: 1,
			kgCo2: "254600",
		});
		expect(line("grid_power")).toMatchObject({ factorYear: "FY 2025-26", scope: 2 });
		expect(line("clinker")).toMatchObject({ factorYear: "version not stated in starter", scope: 1 });
		expect(line("diesel")).toHaveProperty("factorSource", expect.stringContaining("IPCC 2006"));
	});

	it("lists N/A lines without counting them", () => {
		expect(line("furnace_oil")).toEqual({ itemKey: "furnace_oil", state: "NA", naReason: "NOT_USED_THIS_MONTH" });
	});

	it("produces lines that can be stored as an approval, adding up to the totals", () => {
		expect(approvalLines.safeParse(result.lines).success).toBe(true);
		const byScope = (scope: 1 | 2) =>
			sumDecimals(
				result.lines.flatMap((entry) => (entry.state === "VALUE" && entry.scope === scope ? [entry.kgCo2] : [])),
			);
		expect(byScope(1).toFixed()).toBe(result.scope1KgCo2);
		expect(byScope(2).toFixed()).toBe(result.scope2KgCo2);
	});
});

describe("incomplete or wrong input", () => {
	it("refuses a month with an item not entered", () => {
		const { clinker: _missing, ...withoutClinker } = P04_OCTOBER;
		expect(() => calculateCo2(withoutClinker)).toThrow("Clinker produced is not entered");
	});

	it("refuses a value not in the item's canonical unit", () => {
		expect(() => calculateCo2({ ...P04_OCTOBER, diesel: value("95", "kL") })).toThrow("must be in L, not kL");
	});

	it("counts nothing for a grinding unit's fixed N/A clinker", () => {
		const result = calculateCo2({
			coal: notUsed,
			petcoke: notUsed,
			furnace_oil: value("500", "t"),
			diesel: value("60000", "L"),
			grid_power: value("3060", "MWh"),
			clinker: { state: "NA", naReason: "NOT_APPLICABLE" },
		});
		// 500 × 3127 + 60000 × 2.68 = 1,563,500 + 160,800. Grid: 3060 × 675.
		expect(result.scope1KgCo2).toBe("1724300");
		expect(result.scope2KgCo2).toBe("2065500");
	});
});

describe("rounding for display (N2)", () => {
	it("rounds tonnes to 1 decimal place, half up", () => {
		expect(formatTonnes("49.999")).toBe("0.0");
		expect(formatTonnes("50")).toBe("0.1");
		expect(formatTonnes("149.999")).toBe("0.1");
		expect(formatTonnes("150")).toBe("0.2");
		expect(formatTonnes("123456789012")).toBe("12,34,56,789.0");
	});

	it("can show plant figures that add up to 0.1 t more than the total, which is worked out before rounding", () => {
		// Two plants with 50 kg each: each shows 0.1 t, but the company's 100 kg shows 0.1 t, not 0.2 t.
		const plants = ["50", "50"];
		const shownPerPlant = plants.map((kg) => formatTonnes(kg));
		expect(shownPerPlant).toEqual(["0.1", "0.1"]);

		const companyTotal = formatTonnes(sumDecimals(plants));
		expect(companyTotal).toBe("0.1");

		const addedUpFromShown = sumDecimals(shownPerPlant).toFixed(1);
		expect(addedUpFromShown).toBe("0.2");
	});
});
