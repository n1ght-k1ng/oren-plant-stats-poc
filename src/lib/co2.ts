/**
 * CO2 for a month (docs/DECISIONS.md O3, F2, F3, N1, N2, A3, A4).
 *
 * - Each line: canonical value × the factor's kg CO2 per unit. Diesel and clinker calcination are Scope 1;
 *   grid power is Scope 2.
 * - N/A lines count nothing; they are listed, never added as 0.
 * - Totals are added in kg, exactly and unrounded. Tonnes are rounded to 1 decimal place, half up, only for
 *   display (N2). So rounded plant figures can differ from the rounded company total by 0.1 t.
 */
import { ITEMS, type ItemKey } from "@/config/items";
import { D, toD } from "@/lib/decimal";
import { EMISSION_FACTORS, type EmissionFactorKey } from "@/lib/factors";
import { groupIndianDigits } from "@/lib/format";
import type { ApprovalLine } from "@/lib/schemas/report";

export type Co2Line =
	| { state: "VALUE"; value: string; unit: string }
	| { state: "NA"; naReason: "NOT_APPLICABLE" | "NOT_USED_THIS_MONTH" };

export type Co2Result = {
	lines: ApprovalLine[];
	scope1KgCo2: string;
	scope2KgCo2: string;
	totalKgCo2: string;
};

function factorFor(key: EmissionFactorKey) {
	const factor = EMISSION_FACTORS.find((candidate) => candidate.key === key);
	if (!factor) {
		throw new Error(`No emission factor "${key}"`);
	}
	return factor;
}

/** A factor as an exact decimal, from the way it is written in src/lib/factors.ts (for example 2.68). */
export function factorValue(key: EmissionFactorKey): D {
	return toD(String(factorFor(key).kgCo2PerUnit));
}

/** CO2 for a complete month: every item must be a value or N/A. Throws if any item is not entered. */
export function calculateCo2(lines: Partial<Record<ItemKey, Co2Line>>): Co2Result {
	const scopes = { 1: new D(0), 2: new D(0) };
	const approvalLines = ITEMS.map((item): ApprovalLine => {
		const line = lines[item.key];
		if (!line) {
			throw new Error(`${item.label} is not entered, so the month's CO2 cannot be calculated.`);
		}
		if (line.state === "NA") {
			return { itemKey: item.key, state: "NA", naReason: line.naReason };
		}
		if (line.unit !== item.canonicalUnit) {
			throw new Error(`${item.label} must be in ${item.canonicalUnit}, not ${line.unit}.`);
		}
		const factor = factorFor(item.factorKey);
		const perUnit = factorValue(item.factorKey);
		const kgCo2 = toD(line.value).times(perUnit);
		scopes[factor.scope] = scopes[factor.scope].plus(kgCo2);
		return {
			itemKey: item.key,
			state: "VALUE",
			value: toD(line.value).toFixed(),
			unit: line.unit,
			factorKey: item.factorKey,
			kgCo2PerUnit: perUnit.toFixed(),
			factorSource: factor.source,
			factorYear: factor.year,
			scope: factor.scope,
			kgCo2: kgCo2.toFixed(),
		};
	});
	return {
		lines: approvalLines,
		scope1KgCo2: scopes[1].toFixed(),
		scope2KgCo2: scopes[2].toFixed(),
		totalKgCo2: scopes[1].plus(scopes[2]).toFixed(),
	};
}

/**
 * kg CO2 shown as tonnes: 1 decimal place, rounded half up, en-IN grouping. 259993200 kg → "2,59,993.2".
 * Formats the decimal string itself, never via a JS number.
 */
export function formatTonnes(kgCo2: string | D): string {
	const tonnes = toD(typeof kgCo2 === "string" ? kgCo2 : kgCo2.toFixed())
		.dividedBy(1000)
		.toDecimalPlaces(1, D.ROUND_HALF_UP)
		.toFixed(1);
	const [whole, fraction] = tonnes.split(".");
	return `${groupIndianDigits(whole)}.${fraction}`;
}
