import { describe, expect, it } from "vitest";

import { parseQuantity } from "@/lib/quantity";

// Reading quantities as people and spreadsheets write them (docs/DECISIONS.md D4, D11, D13, P3).

describe("parseQuantity", () => {
	it.each([
		["35000", "35000"],
		["11,000", "11000"],
		["1,000,000", "1000000"],
		["1,23,00,000", "12300000"],
		["30,60,000", "3060000"],
		["1,01,700", "101700"],
		["12,34,567", "1234567"],
		["1,500.25", "1500.25"],
		["0.125", "0.125"],
		["0", "0"],
		["  4500  ", "4500"],
		["007", "7"],
		["2.50", "2.5"],
	])("reads %s as %s", (written, value) => {
		expect(parseQuantity(written)).toEqual({ kind: "value", value });
	});

	it("reads every number in the sample files", () => {
		const samples = [
			"35000",
			"7600",
			"160000",
			"4500",
			"285800",
			"11,000",
			"1,500",
			"95",
			"1,23,00,000",
			"1,01,700",
			"500",
			"60",
			"30,60,000",
		];
		for (const written of samples) {
			expect(parseQuantity(written).kind, written).toBe("value");
		}
	});

	it.each(["N/A", "n/a", "NA", "na", "Not applicable", " N/A "])("reads %s as N/A, never 0", (written) => {
		expect(parseQuantity(written)).toEqual({ kind: "na" });
	});

	it.each(["", "   ", "\t"])("reads %j as not entered, never 0", (written) => {
		expect(parseQuantity(written)).toEqual({ kind: "blank" });
	});

	it("refuses negative quantities", () => {
		expect(parseQuantity("-5")).toEqual({ kind: "invalid", message: "Enter a quantity of 0 or more." });
		expect(parseQuantity("- 5")).toEqual({ kind: "invalid", message: "Enter a quantity of 0 or more." });
	});

	it("refuses more than 3 decimal places", () => {
		expect(parseQuantity("1.2345")).toEqual({ kind: "invalid", message: "Enter at most 3 decimal places." });
	});

	it.each([
		"abc",
		"1,2,3,4",
		"1,000,00",
		"12,345,67",
		"1.500,25",
		"1 000",
		"1e5",
		".5",
		"5.",
		"+5",
		"nil",
		"-",
		"Nil",
		"0x10",
	])("refuses %j rather than guess", (written) => {
		const result = parseQuantity(written);
		expect(result.kind).toBe("invalid");
	});

	it("says how to write a number when it refuses one", () => {
		expect(parseQuantity("1,2,3,4")).toEqual({
			kind: "invalid",
			message: '"1,2,3,4" is not a number we can read. Enter a number such as 35000, 11,000 or 1,23,00,000, or N/A.',
		});
	});
});
