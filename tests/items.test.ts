import { describe, expect, it } from "vitest";

import { ITEMS, expectationFor, isItemKey, itemByKey } from "@/config/items";
import { EMISSION_FACTORS } from "@/lib/factors";

// The item catalogue (docs/DECISIONS.md D3, D5, P4, U1).

describe("the item catalogue", () => {
	it("has one item for each emission factor, and no item without one", () => {
		expect(ITEMS.map((item) => item.factorKey).sort()).toEqual(EMISSION_FACTORS.map((factor) => factor.key).sort());
	});

	it("stores each item in its factor's unit", () => {
		for (const item of ITEMS) {
			const factor = EMISSION_FACTORS.find((candidate) => candidate.key === item.factorKey);
			expect(item.canonicalUnit, item.key).toBe(factor?.unit);
		}
		expect(itemByKey("diesel").canonicalUnit).toBe("L");
		expect(itemByKey("grid_power").canonicalUnit).toBe("MWh");
	});

	it("offers each item's canonical unit in the form", () => {
		for (const item of ITEMS) {
			expect(item.formUnits, item.key).toContain(item.canonicalUnit);
		}
	});

	it("never offers million tonnes for monthly data (U1)", () => {
		expect(ITEMS.flatMap((item) => item.formUnits)).not.toContain("Mt");
	});

	it("offers only sensible units: diesel in L or kL, power in kWh or MWh, the rest in t", () => {
		expect(Object.fromEntries(ITEMS.map((item) => [item.key, item.formUnits]))).toEqual({
			coal: ["t"],
			petcoke: ["t"],
			furnace_oil: ["t"],
			diesel: ["L", "kL"],
			grid_power: ["kWh", "MWh"],
			clinker: ["t"],
		});
	});

	it("knows its own keys", () => {
		expect(isItemKey("diesel")).toBe(true);
		expect(isItemKey("HSD")).toBe(false);
		expect(() => itemByKey("HSD" as never)).toThrow('No item "HSD"');
	});
});

describe("expected items per plant type (P4)", () => {
	it("an integrated plant must answer everything but furnace oil, which is optional", () => {
		expect(Object.fromEntries(ITEMS.map((item) => [item.key, expectationFor(item.key, "INTEGRATED")]))).toEqual({
			coal: "EXPECTED",
			petcoke: "EXPECTED",
			furnace_oil: "OPTIONAL",
			diesel: "EXPECTED",
			grid_power: "EXPECTED",
			clinker: "EXPECTED",
		});
	});

	it("a grinding unit expects furnace oil, diesel and power, may report coal or petroleum coke, and never clinker", () => {
		expect(Object.fromEntries(ITEMS.map((item) => [item.key, expectationFor(item.key, "GRINDING_UNIT")]))).toEqual({
			coal: "OPTIONAL",
			petcoke: "OPTIONAL",
			furnace_oil: "EXPECTED",
			diesel: "EXPECTED",
			grid_power: "EXPECTED",
			clinker: "FIXED_NA",
		});
	});
});
