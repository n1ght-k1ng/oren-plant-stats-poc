import { httpBatchLink } from "@trpc/client";
import { createTRPCNext } from "@trpc/next";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import superjson from "superjson";

import type { AppRouter } from "@/server/api/root";

function baseUrl() {
	if (typeof window !== "undefined") {
		return "";
	}
	if (process.env.VERCEL_URL) {
		return `https://${process.env.VERCEL_URL}`;
	}
	return `http://localhost:${process.env.PORT ?? 3000}`;
}

/** tRPC v10 on TanStack Query v4: `api.plant.list.useQuery({})`. */
export const api = createTRPCNext<AppRouter>({
	config() {
		return {
			transformer: superjson,
			links: [httpBatchLink({ url: `${baseUrl()}/api/trpc` })],
			queryClientConfig: {
				defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
			},
		};
	},
	ssr: false,
});

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
