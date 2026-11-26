/**
 * The dashboard's quarter in the address, for example `?quarter=2026-Q2` for Q2 FY 2026-27 (docs/UX-REVIEW.md
 * U38b). The year is the one the financial year starts in.
 */
export type QuarterKey = { fyStartYear: number; quarter: number };

export function quarterParam({ fyStartYear, quarter }: QuarterKey): string {
	return `${fyStartYear}-Q${quarter}`;
}

/** Null for anything that isn't a valid quarter, so a bad link falls back to the default quarter. */
export function parseQuarterParam(value: unknown): QuarterKey | null {
	const match = typeof value === "string" ? /^(\d{4})-Q([1-4])$/.exec(value) : null;
	return match ? { fyStartYear: Number(match[1]), quarter: Number(match[2]) } : null;
}
