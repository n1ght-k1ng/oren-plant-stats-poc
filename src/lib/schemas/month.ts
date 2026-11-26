import { z } from "zod";

import { ITEMS } from "@/config/items";
import { decimalString } from "@/lib/decimal";
import { isPeriod } from "@/lib/periods";
import { PLANT_TYPES } from "@/lib/schemas/plant";
import { checkFlag } from "@/lib/schemas/report";

/** The API for a plant's month (Flow 1). Quantities travel as decimal strings (N1). */

const itemKey = z.enum(ITEMS.map((item) => item.key) as [string, ...string[]]);
const period = z.string().refine(isPeriod, "Choose a month in the form YYYY-MM.");
const status = z.enum(["DRAFT", "SUBMITTED", "RETURNED", "APPROVED"]);

// Inputs

export const openMonthInput = z.object({ plantId: z.string().min(1), period });

export const monthByIdInput = z.object({ reportId: z.string().min(1) });

/** One line as the form holds it: what was typed, not yet converted. */
export const lineInput = z.object({
	itemKey,
	/** "blank" is not entered; never 0 (D4). */
	mode: z.enum(["value", "na", "blank"]),
	/** As typed, for example "1,23,00,000". Read with parseQuantity on the server too. */
	value: z.string().max(40),
	unit: z.string().max(20),
	note: z.string().max(1000).nullable(),
});
export type LineInput = z.infer<typeof lineInput>;

export const saveLinesInput = z.object({
	reportId: z.string().min(1),
	/** The month's version when the form was loaded (F4). */
	expectedVersion: z.number().int().positive(),
	lines: z.array(lineInput).max(ITEMS.length),
});

export const submitMonthInput = z.object({
	reportId: z.string().min(1),
	expectedVersion: z.number().int().positive(),
	/** Blank optional items the data owner confirmed as "Not used this month" (P4). */
	confirmNotUsed: z.array(itemKey).max(ITEMS.length),
});

// Outputs

const plantRef = z.object({ id: z.string(), code: z.string(), name: z.string(), type: z.enum(PLANT_TYPES) });

export const myMonths = z.array(
	z.object({
		plant: plantRef,
		months: z.array(z.object({ period: z.string(), status: status.nullable(), reportId: z.string().nullable() })),
	}),
);
export type MyMonths = z.infer<typeof myMonths>;

export const monthLine = z.object({
	itemKey,
	state: z.enum(["VALUE", "NA", "NOT_ENTERED"]),
	/** Canonical value and unit, when state is VALUE. */
	value: decimalString.nullable(),
	unit: z.string().nullable(),
	enteredValue: z.string().nullable(),
	enteredUnit: z.string().nullable(),
	naReason: z.enum(["NOT_APPLICABLE", "NOT_USED_THIS_MONTH"]).nullable(),
	note: z.string().nullable(),
	source: z.enum(["FORM", "IMPORT"]),
});
export type MonthLine = z.infer<typeof monthLine>;

const checkLine = z.discriminatedUnion("state", [
	z.object({ state: z.literal("VALUE"), value: decimalString }),
	z.object({ state: z.literal("NA") }),
	z.object({ state: z.literal("NOT_ENTERED") }),
]);

export const monthDetail = z.object({
	id: z.string(),
	plant: plantRef,
	period: z.string(),
	status,
	version: z.number().int(),
	/** The plant type when the month was opened; decides the expected items (U9). */
	plantType: z.enum(PLANT_TYPES),
	/** Whether this user can change values and submit now: a data owner, while DRAFT or RETURNED. */
	canEdit: z.boolean(),
	/** Null when this user may not see the current values (R1). */
	lines: z.array(monthLine).nullable(),
	/** Why the values are hidden, when they are. */
	hiddenReason: z.string().nullable(),
	/** What the browser needs to run the checks live while the data owner types (U2). */
	checkContext: z.object({
		capacityTpa: z.number().int().nullable(),
		previous: z.object({ period: z.string(), lines: z.record(checkLine) }).nullable(),
	}),
	/** Live while being edited; as frozen at the latest submission otherwise (U2). */
	flags: z.array(checkFlag),
	/** The latest send-back or reopen comment, shown at the top of a returned month. */
	returnComment: z.object({ text: z.string(), by: z.string(), at: z.date() }).nullable(),
	/** For a submitted month: whether this user may approve or send it back, or why not (O4, U3). */
	review: z.object({ canReview: z.boolean(), blockedReason: z.string().nullable() }),
	history: z.array(
		z.object({
			sequence: z.number().int(),
			action: z.enum(["SUBMIT", "APPROVE", "SEND_BACK", "REOPEN"]),
			toStatus: status,
			actorName: z.string(),
			actorRole: z.string(),
			comment: z.string().nullable(),
			createdAt: z.date(),
			/** On a resubmission: what changed since the previous submission (Flow 3). */
			changes: z.array(z.object({ itemKey: z.string(), label: z.string(), from: z.string(), to: z.string() })),
		}),
	),
});
export type MonthDetail = z.infer<typeof monthDetail>;

export const versionResult = z.object({ status, version: z.number().int() });
