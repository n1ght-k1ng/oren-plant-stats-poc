import type { SessionUser, SwitcherUser } from "@/lib/schemas/session";
import type { Db } from "@/server/db";

const sessionUserSelect = {
	id: true,
	name: true,
	email: true,
	roles: true,
	companyId: true,
	company: { select: { name: true } },
} as const;

export async function getSessionUser(db: Db, userId: string): Promise<SessionUser | null> {
	const user = await db.user.findUnique({ where: { id: userId }, select: sessionUserSelect });
	if (!user) {
		return null;
	}
	const { company, ...rest } = user;
	return { ...rest, companyName: company.name };
}

/** Every sample login, for the user switcher. */
export async function listSwitcherUsers(db: Db): Promise<SwitcherUser[]> {
	const users = await db.user.findMany({
		orderBy: [{ company: { createdAt: "asc" } }, { name: "asc" }],
		select: { ...sessionUserSelect, plants: { select: { code: true, name: true }, orderBy: { code: "asc" } } },
	});
	return users.map(({ company, ...rest }) => ({ ...rest, companyName: company.name }));
}
