export const ROLES = {
	DATA_OWNER: "DATA_OWNER",
	REVIEWER: "REVIEWER",
	SUSTAINABILITY_HEAD: "SUSTAINABILITY_HEAD",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, string> = {
	DATA_OWNER: "Plant data owner",
	REVIEWER: "Reviewer",
	SUSTAINABILITY_HEAD: "Head of Sustainability",
};

/** True when the user holds at least one of the roles. */
export function hasRole(user: { roles: readonly string[] }, ...roles: Role[]): boolean {
	return roles.some((role) => user.roles.includes(role));
}

export function roleLabels(roles: readonly string[]): string {
	return roles
		.filter((role): role is Role => role in ROLE_LABELS)
		.map((role) => ROLE_LABELS[role])
		.join(", ");
}
