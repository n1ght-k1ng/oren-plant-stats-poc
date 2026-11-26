import { createNextApiHandler } from "@trpc/server/adapters/next";

import { appRouter } from "@/server/api/root";
import { createContext } from "@/server/api/trpc";

/** Uploads are capped at 1 MB by the import service (O11); this leaves room for the request around them. */
export const config = { api: { bodyParser: { sizeLimit: "2mb" } } };

export default createNextApiHandler({
	router: appRouter,
	createContext,
	onError({ error, path }) {
		if (error.code === "INTERNAL_SERVER_ERROR") {
			console.error(`tRPC failed on ${path ?? "<no-path>"}:`, error);
		}
	},
});
