import { z } from "zod";

import { decimalString } from "@/lib/decimal";
import { PLANT_TYPES } from "@/lib/schemas/plant";
import { checkFlag } from "@/lib/schemas/report";

/**
 * A month's audit trail (docs/PLAN.md 3.8, H1, brief point 2): how every approved figure came to be. Numbers
 * are decimal strings (N1).
 */

const person = z.object({ name: z.string(), role: z.string() });

/** One approved line, traced from its kg CO2 back to what was typed and who typed it. */
export const tracedLine = z.object({
	itemKey: z.string(),
	label: z.string(),
	state: z.enum(["VALUE", "NA"]),
	/** As typed, for example "1,23,00,000" and "kWh". Null when the app set it, or for N/A. */
	typedValue: z.string().nullable(),
	typedUnit: z.string().nullable(),
	/** Canonical value and unit the CO2 was worked out from. */
	value: decimalString.nullable(),
	unit: z.string().nullable(),
	naReason: z.enum(["NOT_APPLICABLE", "NOT_USED_THIS_MONTH"]).nullable(),
	kgCo2PerUnit: decimalString.nullable(),
	factorSource: z.string().nullable(),
	factorYear: z.string().nullable(),
	scope: z.union([z.literal(1), z.literal(2)]).nullable(),
	kgCo2: decimalString.nullable(),
	note: z.string().nullable(),
	source: z.enum(["FORM", "IMPORT"]).nullable(),
	/** The file the value was imported from, when it was (D16). */
	importedFrom: z.string().nullable(),
	enteredBy: z.string().nullable(),
	enteredAt: z.date().nullable(),
});
export type TracedLine = z.infer<typeof tracedLine>;

const approval = z.object({
	approvedBy: person,
	approvedAt: z.date(),
	comment: z.string().nullable(),
	scope1KgCo2: decimalString,
	scope2KgCo2: decimalString,
	totalKgCo2: decimalString,
	/** Who submitted the version that was approved, and when. */
	submittedBy: z.string().nullable(),
	submittedAt: z.date().nullable(),
	lines: z.array(tracedLine),
});

const change = z.object({ label: z.string(), from: z.string().nullable(), to: z.string().nullable() });

export const timelineEntry = z.object({
	kind: z.enum(["EDIT", "CONFIRM_NOT_USED", "SUBMIT", "SEND_BACK", "APPROVE", "REOPEN"]),
	at: z.date(),
	actor: person,
	comment: z.string().nullable(),
	/** For an edit: each value or note changed. For a resubmission: what changed since the previous one. */
	changes: z.array(change),
	/** For a submission: the flags frozen at that moment (U2). */
	flags: z.array(checkFlag).nullable(),
	/** For an approval: the totals it recorded. */
	totals: z.object({ scope1KgCo2: decimalString, scope2KgCo2: decimalString }).nullable(),
});
export type TimelineEntry = z.infer<typeof timelineEntry>;

export const monthAudit = z.object({
	id: z.string(),
	plant: z.object({ id: z.string(), code: z.string(), name: z.string(), type: z.enum(PLANT_TYPES) }),
	period: z.string(),
	status: z.enum(["DRAFT", "SUBMITTED", "RETURNED", "APPROVED"]),
	/** The approval that counts now; null unless the month is APPROVED. */
	approval: approval.nullable(),
	/** Approvals later reopened: kept, never counted. Newest first. */
	earlierApprovals: z.array(approval.omit({ lines: true })),
	timeline: z.array(timelineEntry),
	/** Every import into the month, with the original text and how it was read (D16). Hidden with draft edits (R1). */
	uploads: z.array(
		z.object({
			id: z.string(),
			label: z.string(),
			uploadedBy: z.string(),
			at: z.date(),
			sizeBytes: z.number().int(),
			content: z.string(),
			headerLine: z.number().int().nullable(),
			rows: z.array(
				z.object({
					line: z.number().int(),
					itemText: z.string(),
					quantityText: z.string(),
					unitText: z.string(),
					itemKey: z.string().nullable(),
					status: z.string(),
					message: z.string().nullable(),
				}),
			),
			warnings: z.array(z.string()),
		}),
	),
	/** True when edits to a draft are left out of the timeline for this user (R1). */
	draftEditsHidden: z.boolean(),
});
export type MonthAudit = z.infer<typeof monthAudit>;
