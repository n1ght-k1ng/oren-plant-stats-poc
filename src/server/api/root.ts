import { dashboardRouter } from "@/server/api/routers/dashboard";
import { monthRouter } from "@/server/api/routers/month";
import { plantRouter } from "@/server/api/routers/plant";
import { reviewRouter } from "@/server/api/routers/review";
import { sessionRouter } from "@/server/api/routers/session";
import { router } from "@/server/api/trpc";

export const appRouter = router({
	session: sessionRouter,
	plant: plantRouter,
	month: monthRouter,
	review: reviewRouter,
	dashboard: dashboardRouter,
});

export type AppRouter = typeof appRouter;
