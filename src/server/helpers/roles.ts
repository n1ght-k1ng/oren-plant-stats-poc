import { TRPCError } from "@trpc/server";

import { ROLE_LABELS, type Role, hasRole } from "@/lib/roles";
import type { SessionUser } from "@/lib/schemas/session";

/** Throws FORBIDDEN unless the user holds at least one of the roles. */
export function requireRole(user: SessionUser, ...roles: Role[]): void {
	if (!hasRole(user, ...roles)) {
		const allowed = roles.map((role) => ROLE_LABELS[role]).join(" or ");
		throw new TRPCError({ code: "FORBIDDEN", message: `Only a ${allowed} can do this.` });
	}
}
