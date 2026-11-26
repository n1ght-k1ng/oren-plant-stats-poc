import type { PrismaClient } from "@prisma/client";
import { TRPCError, initTRPC } from "@trpc/server";
import type { CreateNextContextOptions } from "@trpc/server/adapters/next";
import type { NextApiResponse } from "next";
import superjson from "superjson";
import { ZodError } from "zod";

import { prisma } from "@/server/db";
import { SESSION_COOKIE } from "@/server/helpers/cookies";
import { getSessionUser } from "@/server/services/session";

export type Context = {
	db: PrismaClient;
	/** The signed-in user's id from the session cookie, not yet checked against the database. */
	userId: string | null;
	res?: NextApiResponse;
	secureCookies: boolean;
};

export function createContext({ req, res }: CreateNextContextOptions): Context {
	return {
		db: prisma,
		userId: req.cookies[SESSION_COOKIE] ?? null,
		res,
		secureCookies: req.headers["x-forwarded-proto"] === "https",
	};
}

/** A context without an HTTP request, for tests and server-side callers. */
export function createInnerContext({ userId, db = prisma }: { userId: string | null; db?: PrismaClient }): Context {
	return { db, userId, secureCookies: false };
}

const t = initTRPC.context<Context>().create({
	transformer: superjson,
	errorFormatter({ shape, error }) {
		return {
			...shape,
			data: {
				...shape.data,
				zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
			},
		};
	},
});

export const router = t.router;

export const publicProcedure = t.procedure;

/** Needs a signed-in user, available as `ctx.user`. */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
	const user = ctx.userId ? await getSessionUser(ctx.db, ctx.userId) : null;
	if (!user) {
		throw new TRPCError({ code: "UNAUTHORIZED", message: "Choose a user to continue." });
	}
	return next({ ctx: { ...ctx, user } });
});
