import { TRPCError } from "@trpc/server";

import { sessionUser, switchUserInput, switcherUser } from "@/lib/schemas/session";
import { publicProcedure, router } from "@/server/api/trpc";
import { clearSessionCookie, setSessionCookie } from "@/server/helpers/cookies";
import { getSessionUser, listSwitcherUsers } from "@/server/services/session";

/** Sample logins: anyone can act as any seeded user. There is no real sign-in in this app. */
export const sessionRouter = router({
	users: publicProcedure.output(switcherUser.array()).query(({ ctx }) => listSwitcherUsers(ctx.db)),

	me: publicProcedure
		.output(sessionUser.nullable())
		.query(({ ctx }) => (ctx.userId ? getSessionUser(ctx.db, ctx.userId) : null)),

	switchUser: publicProcedure
		.input(switchUserInput)
		.output(sessionUser)
		.mutation(async ({ ctx, input }) => {
			const user = await getSessionUser(ctx.db, input.userId);
			if (!user) {
				throw new TRPCError({ code: "NOT_FOUND", message: "We could not find this user." });
			}
			setSessionCookie(ctx.res, user.id, ctx.secureCookies);
			return user;
		}),

	signOut: publicProcedure.mutation(({ ctx }) => {
		clearSessionCookie(ctx.res, ctx.secureCookies);
		return { signedOut: true };
	}),
});
