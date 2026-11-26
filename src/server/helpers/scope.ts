import type { SessionUser } from "@/lib/schemas/session";

/**
 * Adds the user's company to a Prisma `where` clause. The company id is set last, so a field in
 * `where` cannot replace it.
 */
export function companyScope<W extends object>(
	user: Pick<SessionUser, "companyId">,
	where?: W,
): W & { companyId: string } {
	return { ...(where ?? ({} as W)), companyId: user.companyId };
}
