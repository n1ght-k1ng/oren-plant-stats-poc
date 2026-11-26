/**
 * Who may do what to a plant's month (docs/DECISIONS.md O4, O5, O8, U3, U4, R1 to R4). Pure, so the screens can
 * use the same rules to show or hide controls. The server enforces them with requirePermission in
 * src/server/helpers/permissions.ts; the screens only reflect them.
 */
import { ROLES, type Role, hasRole } from "@/lib/roles";

export type MonthAction = "view" | "open" | "edit" | "submit" | "approve" | "sendBack" | "reopen";

export type PermissionUser = { id: string; roles: readonly string[]; companyId: string };
export type PermissionPlant = { companyId: string; dataOwnerIds: readonly string[] };

export type PermissionDenial = "OTHER_COMPANY" | "NOT_DATA_OWNER" | "NOT_REVIEWER" | "OWN_PLANT" | "NOT_HEAD";

export type PermissionResult =
	| {
			allowed: true;
			/** The role the action is recorded under (O5). Null for viewing, which is not recorded. */
			actingRole: Role | null;
	  }
	| { allowed: false; reason: PermissionDenial; message: string };

const DENIALS: Record<PermissionDenial, string> = {
	OTHER_COMPANY: "We could not find this month.",
	NOT_DATA_OWNER: "Only a data owner of this plant can enter or submit its data.",
	NOT_REVIEWER: "Only a reviewer or the Head of Sustainability can review a month.",
	OWN_PLANT: "You are a data owner of this plant, so another reviewer must review this month.",
	NOT_HEAD: "Only the Head of Sustainability can reopen an approved month.",
};

function deny(reason: PermissionDenial): PermissionResult {
	return { allowed: false, reason, message: DENIALS[reason] };
}

export function isDataOwnerOf(user: Pick<PermissionUser, "id">, plant: PermissionPlant): boolean {
	return plant.dataOwnerIds.includes(user.id);
}

export function checkPermission(user: PermissionUser, plant: PermissionPlant, action: MonthAction): PermissionResult {
	if (user.companyId !== plant.companyId) {
		return deny("OTHER_COMPANY");
	}
	const ownsPlant = isDataOwnerOf(user, plant);

	switch (action) {
		// R1: anyone in the company can read any of its months.
		case "view":
			return { allowed: true, actingRole: null };

		// O8: any data owner of the plant. R4: being linked to the plant is what counts, not the role.
		case "open":
		case "edit":
		case "submit":
			return ownsPlant ? { allowed: true, actingRole: ROLES.DATA_OWNER } : deny("NOT_DATA_OWNER");

		// O4, U3, U4: a reviewer or the Head, never on a plant they own data for.
		// R3: someone holding both roles is recorded as reviewer.
		case "approve":
		case "sendBack": {
			const role = hasRole(user, ROLES.REVIEWER)
				? ROLES.REVIEWER
				: hasRole(user, ROLES.SUSTAINABILITY_HEAD)
					? ROLES.SUSTAINABILITY_HEAD
					: null;
			if (!role) {
				return deny("NOT_REVIEWER");
			}
			return ownsPlant ? deny("OWN_PLANT") : { allowed: true, actingRole: role };
		}

		// O2: the Head only. R2: not on a plant they own data for, like approving.
		case "reopen":
			if (!hasRole(user, ROLES.SUSTAINABILITY_HEAD)) {
				return deny("NOT_HEAD");
			}
			return ownsPlant ? deny("OWN_PLANT") : { allowed: true, actingRole: ROLES.SUSTAINABILITY_HEAD };
	}
}
