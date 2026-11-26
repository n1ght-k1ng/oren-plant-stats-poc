/**
 * How units are written in plant reports, mapped to the app's units (docs/DECISIONS.md D12, D13).
 *
 * Matching is exact, including case, because case matters: "MT" is metric tonnes, "Mt" is million tonnes.
 * Add each accepted spelling here explicitly. Never match case-insensitively.
 */
import type { Unit } from "@/lib/units";

export const UNIT_ALIASES: Readonly<Record<string, Unit>> = {
	// Mass. "MT" is how Indian reports write metric tonnes (P04's sample).
	t: "t",
	tonne: "t",
	tonnes: "t",
	Tonne: "t",
	Tonnes: "t",
	MT: "t",
	MTs: "t",
	MTS: "t",
	kg: "kg",
	Kg: "kg",
	KG: "kg",
	kgs: "kg",
	Kgs: "kg",

	// Volume.
	L: "L",
	l: "L",
	litre: "L",
	litres: "L",
	Litre: "L",
	Litres: "L",
	liter: "L",
	liters: "L",
	Ltr: "L",
	ltr: "L",
	Ltrs: "L",
	ltrs: "L",
	kL: "kL",
	KL: "kL",
	kl: "kL",
	Kl: "kL",

	// Energy.
	kWh: "kWh",
	KWH: "kWh",
	KWh: "kWh",
	Kwh: "kWh",
	kwh: "kWh",
	MWh: "MWh",
	MWH: "MWh",
	Mwh: "MWh",
	mwh: "MWh",
};

/** Written as million tonnes. Never accepted for monthly data, so never confused with "MT" (U1, D13). */
export const MILLION_TONNES_SPELLINGS: readonly string[] = ["Mt"];
