import { createNextApiHandler } from "@trpc/server/adapters/next";

import { appRouter } from "@/server/api/root";
import { createContext } from "@/server/api/trpc";

export default createNextApiHandler({
	router: appRouter,
	createContext,
	onError({ error, path }) {
		if (error.code === "INTERNAL_SERVER_ERROR") {
			console.error(`tRPC failed on ${path ?? "<no-path>"}:`, error);
		}
	},
});
