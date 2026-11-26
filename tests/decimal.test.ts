import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { D, decimalString, sumDecimals, toD, toDecimalString } from "@/lib/decimal";
import { ROLES } from "@/lib/roles";
import { prisma } from "@/server/db";

import { createTestCompany, createTestPlant, createTestUser, deleteTestCompany } from "./helpers";

// Quantities and CO2 are exact decimals, never JS numbers (docs/DECISIONS.md N1).

describe("sumDecimals", () => {
	it("adds exactly where JS numbers drift", () => {
		expect(0.1 + 0.2).not.toBe(0.3);
		expect(sumDecimals(["0.1", "0.2"]).toFixed()).toBe("0.3");

		const tenths = Array.from({ length: 10 }, () => "0.1");
		expect(tenths.map(Number).reduce((total, value) => total + value, 0)).not.toBe(1);
		expect(sumDecimals(tenths).toFixed()).toBe("1");
	});

	it("keeps every digit of large totals, which Prisma's default 20-digit Decimal would round", () => {
		const total = "12345678901234.12345678";
		expect(new Prisma.Decimal(total).plus("0.00000001").toFixed()).toBe("12345678901234.123457");
		expect(sumDecimals([total, "0.00000001"]).toFixed()).toBe("12345678901234.12345679");
	});

	it("sums an empty list to 0", () => {
		expect(sumDecimals([]).toFixed()).toBe("0");
	});
});

describe("the API boundary", () => {
	it("writes decimals out in full, never with an exponent", () => {
		expect(toDecimalString(new D("0.0000001"))).toBe("0.0000001");
		expect(toDecimalString(new D("123456789012345678901234"))).toBe("123456789012345678901234");
		expect(toDecimalString(new Prisma.Decimal("12300.500000"))).toBe("12300.5");
	});

	it("accepts only plain decimal strings", () => {
		expect(decimalString.safeParse("12300.5").success).toBe(true);
		expect(decimalString.safeParse("-0.25").success).toBe(true);
		for (const bad of ["1e3", "1,000", "12.", ".5", "NaN", ""]) {
			expect(decimalString.safeParse(bad).success).toBe(false);
			expect(() => toD(bad)).toThrow("Not a decimal number");
		}
	});
});

describe("lines stored in the database", () => {
	let companyId: string;
	let reportId: string;

	// kg CO2 per unit, as in src/lib/factors.ts. Scope 1 lines only.
	const lines = [
		{ itemKey: "coal", value: "11000.1", factor: "2441" },
		{ itemKey: "petcoke", value: "1500.001", factor: "3169" },
		{ itemKey: "diesel", value: "95000.7", factor: "2.68" },
		{ itemKey: "furnace_oil", value: "0.3", factor: "3127" },
		{ itemKey: "clinker", value: "101700.123", factor: "525" },
	];

	beforeAll(async () => {
		const company = await createTestCompany();
		companyId = company.id;
		const owner = await createTestUser(companyId, [ROLES.DATA_OWNER]);
		const plant = await createTestPlant(companyId);
		const report = await prisma.monthlyReport.create({
			data: { companyId, plantId: plant.id, period: "2026-10", plantType: plant.type, openedById: owner.id },
		});
		reportId = report.id;
		await prisma.reportLine.createMany({
			data: lines.map((line) => ({
				companyId,
				reportId,
				itemKey: line.itemKey,
				state: "VALUE" as const,
				value: line.value,
				unit: "t",
			})),
		});
	});

	afterAll(async () => {
		await deleteTestCompany(companyId);
	});

	it("round-trips every digit", async () => {
		const stored = await prisma.reportLine.findMany({ where: { reportId }, orderBy: { itemKey: "asc" } });
		const byKey = Object.fromEntries(stored.map((line) => [line.itemKey, line.value && toDecimalString(line.value)]));
		expect(byKey).toEqual(Object.fromEntries(lines.map((line) => [line.itemKey, line.value])));
	});

	it("sums the lines' CO2 to the exact expected total", async () => {
		const stored = await prisma.reportLine.findMany({ where: { reportId } });
		const factorFor = Object.fromEntries(lines.map((line) => [line.itemKey, line.factor]));
		const co2 = stored.map((line) => {
			if (!line.value) {
				throw new Error(`Line ${line.itemKey} has no value`);
			}
			return toD(line.value).times(factorFor[line.itemKey]);
		});

		// Worked out independently with Python's decimal module.
		expect(toDecimalString(sumDecimals(co2))).toBe("85252851.82");

		// The same sum in JS numbers is off, which is why every column and calculation uses Decimal.
		const asNumbers = lines.reduce((total, line) => total + Number(line.value) * Number(line.factor), 0);
		expect(asNumbers).toBe(85252851.82000001);
	});

	it("agrees with the database's own sum", async () => {
		const { _sum } = await prisma.reportLine.aggregate({ where: { reportId }, _sum: { value: true } });
		const expected = sumDecimals(lines.map((line) => line.value));
		expect(_sum.value && toDecimalString(_sum.value)).toBe(toDecimalString(expected));
		expect(toDecimalString(expected)).toBe("209201.224");
	});
});
