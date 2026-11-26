import { z } from "zod";

import { PLANT_TYPES } from "@/lib/schemas/plant";

/** The API for reviewing a month (Flow 2). */

export const reviewQueue = z.array(
	z.object({
		reportId: z.string(),
		plant: z.object({ id: z.string(), code: z.string(), name: z.string(), type: z.enum(PLANT_TYPES) }),
		period: z.string(),
		submittedAt: z.date(),
		submittedBy: z.string(),
		/** Warning flags frozen at submission. Months with any come first (Flow 2: time on figures that need a look). */
		warningCount: z.number().int(),
		/** Whether this user may approve or send it back. False for a plant they own data for (U3). */
		canReview: z.boolean(),
		blockedReason: z.string().nullable(),
	}),
);
export type ReviewQueue = z.infer<typeof reviewQueue>;

export const approveInput = z.object({
	reportId: z.string().min(1),
	expectedVersion: z.number().int().positive(),
	/** Required when the month has flags: why the flagged values are accepted (U6). */
	comment: z.string().max(2000).nullable(),
});

export const reopenInput = z.object({
	reportId: z.string().min(1),
	expectedVersion: z.number().int().positive(),
	/** Required: why the approved month is reopened (O2). */
	comment: z.string().max(2000),
});

export const sendBackInput = z.object({
	reportId: z.string().min(1),
	expectedVersion: z.number().int().positive(),
	/** Required: what needs fixing (O12). */
	comment: z.string().max(2000),
});
