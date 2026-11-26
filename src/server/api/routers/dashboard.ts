import { dashboard, dashboardInput } from "@/lib/schemas/dashboard";
import { protectedProcedure, router } from "@/server/api/trpc";
import { getDashboard } from "@/server/services/dashboard";

/** Flow 4: Meera's view of where every plant and month stands, and the approved CO2. */
export const dashboardRouter = router({
	overview: protectedProcedure
		.input(dashboardInput)
		.output(dashboard)
		.query(({ ctx, input }) => getDashboard(ctx.db, ctx.user, input, new Date())),
});
