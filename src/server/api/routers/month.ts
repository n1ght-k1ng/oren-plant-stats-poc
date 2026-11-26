import { z } from "zod";

import { monthAudit } from "@/lib/schemas/audit";
import { importInput, importResult } from "@/lib/schemas/import";
import {
	monthByIdInput,
	monthDetail,
	myMonths,
	openMonthInput,
	saveLinesInput,
	submitMonthInput,
	versionResult,
} from "@/lib/schemas/month";
import { protectedProcedure, router } from "@/server/api/trpc";
import { getAudit } from "@/server/services/audit";
import { importIntoMonth } from "@/server/services/import";
import { getMonth, listMyMonths, openMonth, saveLines, submitMonth } from "@/server/services/month";

/** Flow 1: a plant's month, from opening to submission. Rules live in the service; this only wires them up. */
export const monthRouter = router({
	mine: protectedProcedure.output(myMonths).query(({ ctx }) => listMyMonths(ctx.db, ctx.user, new Date())),

	open: protectedProcedure
		.input(openMonthInput)
		.output(z.object({ reportId: z.string() }))
		.mutation(({ ctx, input }) => openMonth(ctx.db, ctx.user, input, new Date())),

	byId: protectedProcedure
		.input(monthByIdInput)
		.output(monthDetail)
		.query(({ ctx, input }) => getMonth(ctx.db, ctx.user, input.reportId)),

	/** The audit trail: approved figures traced back to what was typed, and every step in order (3.8). */
	audit: protectedProcedure
		.input(monthByIdInput)
		.output(monthAudit)
		.query(({ ctx, input }) => getAudit(ctx.db, ctx.user, input.reportId)),

	/** Reads a file or paste and stores it; returns what it proposes. Never changes the month (D9). */
	import: protectedProcedure
		.input(importInput)
		.output(importResult)
		.mutation(({ ctx, input }) => importIntoMonth(ctx.db, ctx.user, input)),

	save: protectedProcedure
		.input(saveLinesInput)
		.output(versionResult)
		.mutation(({ ctx, input }) => saveLines(ctx.db, ctx.user, input)),

	submit: protectedProcedure
		.input(submitMonthInput)
		.output(versionResult)
		.mutation(({ ctx, input }) => submitMonth(ctx.db, ctx.user, input)),
});
