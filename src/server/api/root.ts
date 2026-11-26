import { monthRouter } from "@/server/api/routers/month";
import { plantRouter } from "@/server/api/routers/plant";
import { sessionRouter } from "@/server/api/routers/session";
import { router } from "@/server/api/trpc";

export const appRouter = router({
	session: sessionRouter,
	plant: plantRouter,
	month: monthRouter,
});

export type AppRouter = typeof appRouter;
