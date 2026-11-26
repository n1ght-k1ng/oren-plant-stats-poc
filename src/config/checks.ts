/**
 * Plausibility check settings (docs/DECISIONS.md P5, P7, D7). Every range is an ASSUMPTION (A5): a starting
 * point from typical Indian cement plants and the sample files, not from Nimbus's history. Checks only warn;
 * they never block. A developer changes these; there is no settings screen in v1 (U7).
 *
 * Numbers are decimal strings, so comparisons are exact (N1).
 */

/** Energy in a tonne of each kiln fuel, GJ/t: the IPCC 2006 defaults cited in src/lib/factors.ts (A2). */
export const KILN_FUEL_ENERGY_GJ_PER_TONNE = {
	coal: "25.8",
	petcoke: "32.5",
	furnace_oil: "40.4",
} as const;

export type Range = { low: string; high: string };

/** Integrated plants (P5). A value outside the range is flagged; the limits themselves are fine. */
export const INTEGRATED_RANGES = {
	/** All kiln fuel energy per tonne of clinker. A modern dry-process kiln uses about 3.0 to 3.6. */
	kilnEnergyGjPerTonneClinker: { low: "2.8", high: "3.9" },
	/** Grid power per tonne of clinker. About 80 to 110 for a whole plant; far less with its own power plant. */
	gridKwhPerTonneClinker: { low: "60", high: "130" },
	/** Diesel per tonne of clinker: mining vehicles and standby generators. Low confidence, so wide. */
	dieselLitresPerTonneClinker: { low: "0.1", high: "2.0" },
	/** Clinker as a share of the month's cement capacity (capacity × days ÷ 365). */
	clinkerShareOfCapacity: { low: "0.30", high: "1.10" },
} as const satisfies Record<string, Range>;

/** Change from the last approved month above which an item is flagged, either way (P7). 0.30 is 30%. */
export const MONTH_ON_MONTH_CHANGE_LIMIT = "0.30";
