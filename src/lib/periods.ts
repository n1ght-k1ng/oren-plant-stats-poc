/**
 * Reporting months, written "YYYY-MM" (docs/DECISIONS.md O7).
 *
 * - Months can be entered once they have ended, from FIRST_REPORTING_PERIOD in src/config/reporting.ts.
 * - A month ends at midnight India Standard Time (UTC+5:30, no daylight saving), not UTC (A9).
 * - Quarters follow the Indian financial year, April to March: October 2026 is Q3 FY 2026-27.
 */

import { FIRST_REPORTING_PERIOD } from "@/config/reporting";

const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;
const IST_OFFSET_MINUTES = 5 * 60 + 30;

const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
] as const;

export function isPeriod(value: string): boolean {
	return PERIOD.test(value);
}

/** Year and month (1 to 12). Throws for anything that is not "YYYY-MM". */
export function parsePeriod(period: string): { year: number; month: number } {
	const match = PERIOD.exec(period);
	if (!match) {
		throw new Error(`Not a month: "${period}". Expected YYYY-MM, for example 2026-10.`);
	}
	return { year: Number(match[1]), month: Number(match[2]) };
}

function formatPeriod(year: number, month: number): string {
	return `${year}-${String(month).padStart(2, "0")}`;
}

/** The month it is now in India. */
export function currentPeriod(now: Date): string {
	const inIndia = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
	return formatPeriod(inIndia.getUTCFullYear(), inIndia.getUTCMonth() + 1);
}

/** True once the month is over in India. "YYYY-MM" strings sort in date order. */
export function hasEnded(period: string, now: Date): boolean {
	parsePeriod(period);
	return period < currentPeriod(now);
}

/** Why a month cannot be opened yet, or null when it can. `firstPeriod` defaults to the configured first month. */
export function cannotOpenReason(period: string, now: Date, firstPeriod = FIRST_REPORTING_PERIOD): string | null {
	if (!isPeriod(period)) {
		return "Choose a month in the form YYYY-MM.";
	}
	if (period < firstPeriod) {
		return `Months before ${periodLabel(firstPeriod)} are not collected here.`;
	}
	if (!hasEnded(period, now)) {
		return `${periodLabel(period)} has not ended yet.`;
	}
	return null;
}

export function daysInMonth(period: string): number {
	const { year, month } = parsePeriod(period);
	// Day 0 of the next month is the last day of this one.
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "October 2026" */
export function periodLabel(period: string): string {
	const { year, month } = parsePeriod(period);
	return `${MONTH_NAMES[month - 1]} ${year}`;
}

export type FinancialQuarter = {
	/** Year the financial year starts in: FY 2026-27 is 2026. */
	fyStartYear: number;
	quarter: 1 | 2 | 3 | 4;
	/** "FY 2026-27" */
	fyLabel: string;
	/** "Q3 FY 2026-27" */
	label: string;
};

/** April to June is Q1, and January to March is Q4 of the financial year that began the previous April. */
export function financialQuarter(period: string): FinancialQuarter {
	const { year, month } = parsePeriod(period);
	const fyStartYear = month >= 4 ? year : year - 1;
	const quarter = (Math.floor(((month + 8) % 12) / 3) + 1) as FinancialQuarter["quarter"];
	const fyLabel = `FY ${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, "0")}`;
	return { fyStartYear, quarter, fyLabel, label: `Q${quarter} ${fyLabel}` };
}

/** The three months of a financial quarter, in order. */
export function periodsInQuarter(fyStartYear: number, quarter: FinancialQuarter["quarter"]): string[] {
	return [0, 1, 2].map((offset) => {
		const monthsFromApril = (quarter - 1) * 3 + offset;
		const month = ((monthsFromApril + 3) % 12) + 1;
		return formatPeriod(month >= 4 ? fyStartYear : fyStartYear + 1, month);
	});
}
