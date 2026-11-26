import { describe, expect, it } from "vitest";

import { convert, isUnit } from "@/lib/units";

describe("convert", () => {
	it("converts within a dimension", () => {
		expect(convert(3_500_000, "t", "Mt")).toBe(3.5);
		expect(convert(4.5, "MWh", "kWh")).toBe(4_500);
		expect(convert(60, "kL", "L")).toBe(60_000);
	});

	it("refuses to convert between dimensions", () => {
		expect(() => convert(10, "t", "L")).toThrow("Cannot convert tonnes to litres.");
	});
});

describe("isUnit", () => {
	it("knows the catalogue's units and nothing else", () => {
		expect(isUnit("MWh")).toBe(true);
		expect(isUnit("toString")).toBe(false);
	});
});
