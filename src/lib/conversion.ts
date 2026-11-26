/**
 * Turns a written unit into the app's unit, and a value into its item's canonical unit (docs/DECISIONS.md D5,
 * D12, D13, N1). Exact: conversion uses decimals, never JS numbers.
 */
import { type ItemKey, itemByKey } from "@/config/items";
import { MILLION_TONNES_SPELLINGS, UNIT_ALIASES } from "@/config/units";
import { D, toD } from "@/lib/decimal";
import { UNITS, type Unit } from "@/lib/units";

export type UnitProblem = "MISSING" | "MILLION_TONNES" | "UNKNOWN" | "WRONG_DIMENSION";

export type ResolvedUnit = { ok: true; unit: Unit } | { ok: false; problem: UnitProblem; message: string };

const DIMENSION_WORDS = { mass: "weight", volume: "volume", energy: "energy" } as const;

/** Matches a unit exactly as written against the aliases in config. Unknown units are reported, not guessed. */
export function resolveUnit(written: string): ResolvedUnit {
	const text = written.trim();
	if (text === "") {
		return { ok: false, problem: "MISSING", message: "No unit given." };
	}
	if (MILLION_TONNES_SPELLINGS.includes(text)) {
		return {
			ok: false,
			problem: "MILLION_TONNES",
			message: `"${text}" means million tonnes. Monthly figures are in tonnes: write t or MT.`,
		};
	}
	const unit = UNIT_ALIASES[text];
	if (!unit) {
		return { ok: false, problem: "UNKNOWN", message: `We don't recognise the unit "${text}".` };
	}
	return { ok: true, unit };
}

export type CanonicalValue =
	| {
			ok: true;
			/** In the item's canonical unit, as an exact decimal string. */
			value: string;
			unit: Unit;
	  }
	| { ok: false; problem: UnitProblem; message: string };

/** Converts a value written in some unit to the item's canonical unit, for example 95 KL of diesel to 95000 L. */
export function toCanonical(itemKey: ItemKey, value: string, writtenUnit: string): CanonicalValue {
	const resolved = resolveUnit(writtenUnit);
	if (!resolved.ok) {
		return resolved;
	}
	const item = itemByKey(itemKey);
	const from = UNITS[resolved.unit];
	const to = UNITS[item.canonicalUnit];
	if (from.dimension !== to.dimension) {
		const allowed = item.formUnits.join(" or ");
		return {
			ok: false,
			problem: "WRONG_DIMENSION",
			message: `${item.label} is measured by ${DIMENSION_WORDS[to.dimension]} (${allowed}), not in ${from.label}.`,
		};
	}
	const converted = toD(value).times(new D(from.toBase)).dividedBy(new D(to.toBase));
	return { ok: true, value: converted.toFixed(), unit: item.canonicalUnit };
}
