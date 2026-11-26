import { describe, expect, it } from "vitest";

import { FIRST_REPORTING_PERIOD } from "@/config/reporting";
import {
	cannotOpenReason,
	currentPeriod,
	daysInMonth,
	financialQuarter,
	hasEnded,
	isPeriod,
	parsePeriod,
	periodLabel,
	periodsInQuarter,
} from "@/lib/periods";

// Reporting months (docs/DECISIONS.md O7, A9).

describe("the YYYY-MM format", () => {
	it("accepts real months only", () => {
		expect(isPeriod("2026-10")).toBe(true);
		for (const bad of ["2026-13", "2026-00", "2026-1", "26-10", "2026/10", "Oct-26", "2026-10-01", ""]) {
			expect(isPeriod(bad), bad).toBe(false);
		}
		expect(() => parsePeriod("Oct-26")).toThrow('Not a month: "Oct-26"');
	});

	it("labels a month the way people write it", () => {
		expect(periodLabel("2026-10")).toBe("October 2026");
	});
});

describe("financial quarters (April to March)", () => {
	it.each([
		["2026-04", "Q1 FY 2026-27"],
		["2026-06", "Q1 FY 2026-27"],
		["2026-07", "Q2 FY 2026-27"],
		["2026-10", "Q3 FY 2026-27"],
		["2026-12", "Q3 FY 2026-27"],
		["2027-01", "Q4 FY 2026-27"],
		["2027-03", "Q4 FY 2026-27"],
		["2027-04", "Q1 FY 2027-28"],
		["2099-12", "Q3 FY 2099-00"],
	])("%s is in %s", (period, label) => {
		expect(financialQuarter(period).label).toBe(label);
	});

	it("lists each quarter's months, crossing into the next calendar year for Q4", () => {
		expect(periodsInQuarter(2026, 1)).toEqual(["2026-04", "2026-05", "2026-06"]);
		expect(periodsInQuarter(2026, 3)).toEqual(["2026-10", "2026-11", "2026-12"]);
		expect(periodsInQuarter(2026, 4)).toEqual(["2027-01", "2027-02", "2027-03"]);
	});

	it("puts every month of a quarter back in that quarter", () => {
		for (const quarter of [1, 2, 3, 4] as const) {
			for (const period of periodsInQuarter(2026, quarter)) {
				expect(financialQuarter(period)).toMatchObject({ fyStartYear: 2026, quarter });
			}
		}
	});
});

describe("days in a month", () => {
	it.each([
		["2026-10", 31],
		["2026-11", 30],
		["2027-02", 28],
		["2028-02", 29],
		["2100-02", 28],
	])("%s has %i days", (period, days) => {
		expect(daysInMonth(period)).toBe(days);
	});
});

describe("which months can be opened", () => {
	const midNovember = new Date("2026-11-15T06:00:00Z");

	it("opens months that have ended, from the configured first month (April 2026)", () => {
		expect(FIRST_REPORTING_PERIOD).toBe("2026-04");
		expect(cannotOpenReason("2026-04", midNovember)).toBeNull();
		expect(cannotOpenReason("2026-10", midNovember)).toBeNull();
	});

	it("does not open the current month, a future month, or one before April 2026", () => {
		expect(cannotOpenReason("2026-11", midNovember)).toBe("November 2026 has not ended yet.");
		expect(cannotOpenReason("2027-01", midNovember)).toBe("January 2027 has not ended yet.");
		expect(cannotOpenReason("2026-03", midNovember)).toBe("Months before April 2026 are not collected here.");
		expect(cannotOpenReason("Oct-26", midNovember)).toBe("Choose a month in the form YYYY-MM.");
	});

	it("follows a different first month when one is configured", () => {
		expect(cannotOpenReason("2026-03", midNovember, "2025-04")).toBeNull();
		expect(cannotOpenReason("2025-03", midNovember, "2025-04")).toBe(
			"Months before April 2025 are not collected here.",
		);
	});

	it("ends a month at midnight in India, not in UTC", () => {
		// 23:30 on 31 October in India.
		const lastHalfHour = new Date("2026-10-31T18:00:00Z");
		expect(currentPeriod(lastHalfHour)).toBe("2026-10");
		expect(hasEnded("2026-10", lastHalfHour)).toBe(false);

		// 00:00 on 1 November in India, while it is still 31 October in UTC.
		const midnightInIndia = new Date("2026-10-31T18:30:00Z");
		expect(currentPeriod(midnightInIndia)).toBe("2026-11");
		expect(hasEnded("2026-10", midnightInIndia)).toBe(true);
	});

	it("rolls over the year correctly", () => {
		const newYearInIndia = new Date("2026-12-31T18:30:00Z");
		expect(currentPeriod(newYearInIndia)).toBe("2027-01");
		expect(hasEnded("2026-12", newYearInIndia)).toBe(true);
	});
});
