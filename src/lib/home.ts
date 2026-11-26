import { ROLES, hasRole } from "@/lib/roles";

/**
 * Where each person starts (docs/UX-REVIEW.md U1): the page with their own work, not the plant register.
 * The Head goes to the dashboard; reviewers to the review queue (also people who own a plant's data too, since
 * reviews are time-sensitive and their own months are one click away); data owners to their months.
 */
export function homeFor(user: { roles: readonly string[] }): string {
	if (hasRole(user, ROLES.SUSTAINABILITY_HEAD)) {
		return "/dashboard";
	}
	if (hasRole(user, ROLES.REVIEWER)) {
		return "/review";
	}
	if (hasRole(user, ROLES.DATA_OWNER)) {
		return "/months";
	}
	return "/plants";
}
