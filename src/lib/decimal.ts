/**
 * Exact decimal numbers for quantities and CO2 (docs/DECISIONS.md N1). Never use `number` for these.
 *
 * - Arithmetic: `D`, a copy of Prisma's Decimal (decimal.js) set to 50 significant digits. The default
 *   (20) rounds even additions once a kg CO2 total with 8 decimal places passes 12 digits before the point.
 * - Values read from Prisma are Prisma.Decimal at the default precision: pass them through `toD` before
 *   doing arithmetic.
 * - Across tRPC, quantities travel as plain decimal strings: `decimalString` in output schemas, and
 *   `toDecimalString` when building the response.
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";

export const D = Prisma.Decimal.clone({ precision: 50, rounding: Prisma.Decimal.ROUND_HALF_UP });
export type D = InstanceType<typeof D>;

/** A decimal written out in full: optional minus, digits, optional fraction. No exponent, no grouping. */
const DECIMAL_STRING = /^-?\d+(\.\d+)?$/;

/** A decimal as it travels across the API. */
export const decimalString = z.string().regex(DECIMAL_STRING, "Expected a decimal number such as 12300.5");

/** Accepts a Prisma Decimal, one of ours, or a decimal string. Never a JS number, which may already be inexact. */
export function toD(value: Prisma.Decimal | D | string): D {
	const text = typeof value === "string" ? value : value.toFixed();
	if (!DECIMAL_STRING.test(text)) {
		throw new Error(`Not a decimal number: "${text}"`);
	}
	return new D(text);
}

/** Full decimal string for the API and JSON columns: never an exponent, no trailing zeros. */
export function toDecimalString(value: Prisma.Decimal | D): string {
	return toD(value).toFixed();
}

/** Exact sum. An empty list sums to 0. */
export function sumDecimals(values: readonly (Prisma.Decimal | D | string)[]): D {
	return values.reduce<D>((total, value) => total.plus(toD(value)), new D(0));
}
