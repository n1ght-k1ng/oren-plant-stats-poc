import { versionResult } from "@/lib/schemas/month";
import { approveInput, reopenInput, reviewQueue, sendBackInput } from "@/lib/schemas/review";
import { protectedProcedure, router } from "@/server/api/trpc";
import { approveMonth, listQueue, reopenMonth, sendBackMonth } from "@/server/services/review";

/** Flow 2: the review queue, approving and sending back. Rules live in the service. */
export const reviewRouter = router({
	queue: protectedProcedure.output(reviewQueue).query(({ ctx }) => listQueue(ctx.db, ctx.user)),

	approve: protectedProcedure
		.input(approveInput)
		.output(versionResult)
		.mutation(({ ctx, input }) => approveMonth(ctx.db, ctx.user, input)),

	reopen: protectedProcedure
		.input(reopenInput)
		.output(versionResult)
		.mutation(({ ctx, input }) => reopenMonth(ctx.db, ctx.user, input)),

	sendBack: protectedProcedure
		.input(sendBackInput)
		.output(versionResult)
		.mutation(({ ctx, input }) => sendBackMonth(ctx.db, ctx.user, input)),
});
