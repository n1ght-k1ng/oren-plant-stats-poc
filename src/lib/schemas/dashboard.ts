import { z } from "zod";

import { decimalString } from "@/lib/decimal";
import { PLANT_TYPES } from "@/lib/schemas/plant";

/** Meera's dashboard (Flow 4; docs/PLAN.md 5.1; O6, O7, N2, V1 to V3). */

const quarterRef = z.object({
	fyStartYear: z.number().int(),
	quarter: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
	label: z.string(),
});

export const dashboardInput = z
	.object({ fyStartYear: z.number().int().min(2000).max(2100), quarter: z.number().int().min(1).max(4) })
	.nullable();

const co2 = z.object({ scope1KgCo2: decimalString, scope2KgCo2: decimalString, totalKgCo2: decimalString });

const status = z.enum(["DRAFT", "SUBMITTED", "RETURNED", "APPROVED"]);

export const dashboardCell = z.object({
	period: z.string(),
	/** False for a month that hasn't ended: not due, so not missing. */
	due: z.boolean(),
	/** Null when the month hasn't been started. */
	status: status.nullable(),
	reportId: z.string().nullable(),
	/** When a submitted month was last submitted, to show how long it has waited. */
	waitingSince: z.date().nullable(),
	/** Approved figures, only for a month that is approved now. Never zero for anything else. */
	approved: co2.nullable(),
});
export type DashboardCell = z.infer<typeof dashboardCell>;

export const dashboard = z.object({
	quarter: quarterRef.extend({ periods: z.array(z.string()) }),
	/** Quarters that can be chosen, newest first. */
	quarters: z.array(quarterRef),
	plants: z.array(
		z.object({
			plant: z.object({ id: z.string(), code: z.string(), name: z.string(), type: z.enum(PLANT_TYPES) }),
			cells: z.array(dashboardCell),
			/** Approved months only. Null when none is approved. */
			approved: co2.nullable(),
			approvedMonths: z.number().int(),
			dueMonths: z.number().int(),
		}),
	),
	company: z.object({
		/** Approved months only. Null when none is approved. */
		approved: co2.nullable(),
		approvedMonths: z.number().int(),
		dueMonths: z.number().int(),
		/** Months of the quarter that haven't ended yet, so aren't counted. */
		notDue: z.array(z.string()),
		/** Every due plant-month that isn't approved, with where it stands. */
		missing: z.array(
			z.object({
				plantCode: z.string(),
				period: z.string(),
				status: status.nullable(),
				reportId: z.string().nullable(),
			}),
		),
	}),
});
export type Dashboard = z.infer<typeof dashboard>;
