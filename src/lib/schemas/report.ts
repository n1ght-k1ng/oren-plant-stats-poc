import { z } from "zod";

import { decimalString } from "@/lib/decimal";

/**
 * Records frozen into JSON columns for the audit trail (docs/DECISIONS.md F1, F2). Validate with these
 * schemas when writing, and again when reading for the history. Numbers are decimal strings (N1).
 */

const itemKey = z.string().min(1);
const unit = z.string().min(1);

/** A line's state, value and why it is N/A, with the fields each state requires. */
const lineValue = z.discriminatedUnion("state", [
	z.object({ state: z.literal("VALUE"), value: decimalString, unit }),
	z.object({ state: z.literal("NA"), naReason: z.enum(["NOT_APPLICABLE", "NOT_USED_THIS_MONTH"]) }),
	z.object({ state: z.literal("NOT_ENTERED") }),
]);

/** One line exactly as submitted, frozen on each SUBMIT event (F1). */
export const submittedLine = z
	.object({
		itemKey,
		/** As typed or imported, for example "1,23,00,000" and "kWh". */
		enteredValue: z.string().nullable(),
		enteredUnit: z.string().nullable(),
		note: z.string().nullable(),
		source: z.enum(["FORM", "IMPORT"]),
		uploadId: z.string().nullable(),
	})
	.and(lineValue);
export type SubmittedLine = z.infer<typeof submittedLine>;

export const submittedLines = z.array(submittedLine);

/** The factor applied to a line when it was approved (F2). */
const appliedFactor = z.object({
	factorKey: z.string().min(1),
	/** kg CO2 per canonical unit, as a decimal string. */
	kgCo2PerUnit: decimalString,
	factorSource: z.string().min(1),
	/** The year or period the factor belongs to, for example "2006" or "FY 2025-26". */
	factorYear: z.string().min(1),
	scope: z.union([z.literal(1), z.literal(2)]),
});

/** One line of an approval: what was counted, with which factor, and the CO2 that resulted (F2). */
export const approvalLine = z.discriminatedUnion("state", [
	z.object({
		itemKey,
		state: z.literal("VALUE"),
		value: decimalString,
		unit,
		...appliedFactor.shape,
		kgCo2: decimalString,
	}),
	/** N/A lines are kept so the approval shows every item, but they count nothing. */
	z.object({
		itemKey,
		state: z.literal("NA"),
		naReason: z.enum(["NOT_APPLICABLE", "NOT_USED_THIS_MONTH"]),
	}),
]);
export type ApprovalLine = z.infer<typeof approvalLine>;

export const approvalLines = z.array(approvalLine);
