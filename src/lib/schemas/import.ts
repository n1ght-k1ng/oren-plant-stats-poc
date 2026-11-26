import { z } from "zod";

import { ITEMS } from "@/config/items";

/** The API for importing a file or a paste into a month (docs/PLAN.md 4.2; D8, D9, D16, O11). */

/** O11: uploads are stored in Postgres, up to 1 MB. */
export const MAX_UPLOAD_BYTES = 1024 * 1024;

const itemKey = z.enum(ITEMS.map((item) => item.key) as [string, ...string[]]);

export const importInput = z.object({
	reportId: z.string().min(1),
	kind: z.enum(["FILE", "PASTE"]),
	/** The file's name; null for a paste. */
	filename: z.string().max(255).nullable(),
	/** Exactly as read. The service checks the 1 MB limit in bytes and explains it; this only stops the absurd. */
	content: z.string().max(MAX_UPLOAD_BYTES * 2),
});

const proposed = z.discriminatedUnion("mode", [
	z.object({ mode: z.literal("value"), value: z.string(), unit: z.string().nullable() }),
	z.object({ mode: z.literal("na") }),
]);

export const importRow = z.object({
	line: z.number().int(),
	itemText: z.string(),
	quantityText: z.string(),
	unitText: z.string(),
	remarks: z.string(),
	itemKey: itemKey.nullable(),
	note: z.string().nullable(),
	status: z.enum(["READY", "ASK", "UNMATCHED", "INVALID", "NO_QUANTITY", "FIXED_NA"]),
	questions: z.array(z.enum(["MT_UNIT", "BLANK_UNIT", "NA_VALUE"])),
	message: z.string().nullable(),
	proposed: proposed.nullable(),
});

/** What the file was read as. Stored with the upload for the audit trail (D16). */
export const importMapping = z.object({
	headerLine: z.number().int().nullable(),
	rows: z.array(importRow),
	warnings: z.array(z.string()),
	error: z.string().nullable(),
});

export const importResult = z.object({ uploadId: z.string(), mapping: importMapping });
export type ImportResult = z.infer<typeof importResult>;
