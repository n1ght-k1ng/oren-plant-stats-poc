import { TRPCError } from "@trpc/server";

import {
	type MonthAction,
	type PermissionMonth,
	type PermissionPlant,
	type PermissionUser,
	checkPermission,
} from "@/lib/permissions";
import type { Role } from "@/lib/roles";

/**
 * Enforces the permission rules on the server and returns the role to record. Another company's month
 * is NOT_FOUND, so its existence is never revealed; every other refusal is FORBIDDEN, with the reason.
 */
export function requirePermission(
	user: PermissionUser,
	plant: PermissionPlant,
	action: MonthAction,
	month?: PermissionMonth,
): { actingRole: Role | null } {
	const result = checkPermission(user, plant, action, month);
	if (result.allowed) {
		return { actingRole: result.actingRole };
	}
	throw new TRPCError({ code: result.reason === "OTHER_COMPANY" ? "NOT_FOUND" : "FORBIDDEN", message: result.message });
}
