import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import type { ReportStatus } from "@prisma/client";

import { type MonthAction, type PermissionPlant, type PermissionUser, checkPermission } from "@/lib/permissions";
import { ROLES } from "@/lib/roles";
import { requirePermission } from "@/server/helpers/permissions";

// Who may do what (docs/DECISIONS.md O2, O4, O5, O8, U3, U4, R1 to R4), with users shaped like the seed data.

const NIMBUS = "nimbus";
const KESTREL = "kestrel";

const users = {
	ravi: { id: "ravi", roles: [ROLES.DATA_OWNER], companyId: NIMBUS },
	karthik: { id: "karthik", roles: [ROLES.DATA_OWNER], companyId: NIMBUS },
	priya: { id: "priya", roles: [ROLES.REVIEWER, ROLES.DATA_OWNER], companyId: NIMBUS },
	vikram: { id: "vikram", roles: [ROLES.REVIEWER], companyId: NIMBUS },
	meera: { id: "meera", roles: [ROLES.SUSTAINABILITY_HEAD], companyId: NIMBUS },
	rohan: { id: "rohan", roles: [ROLES.SUSTAINABILITY_HEAD], companyId: KESTREL },
} satisfies Record<string, PermissionUser>;
type Name = keyof typeof users;

const P01: PermissionPlant = { companyId: NIMBUS, dataOwnerIds: ["ravi"] };
const P05: PermissionPlant = { companyId: NIMBUS, dataOwnerIds: ["karthik", "priya"] };

/** "DATA_OWNER" etc. means allowed and recorded in that role; "view" is allowed and not recorded. */
type Expected =
	| "DATA_OWNER"
	| "REVIEWER"
	| "SUSTAINABILITY_HEAD"
	| "view"
	| "OTHER_COMPANY"
	| "NOT_DATA_OWNER"
	| "NOT_REVIEWER"
	| "OWN_PLANT"
	| "NOT_HEAD"
	| "VALUES_NOT_SUBMITTED";

function outcome(name: Name, plant: PermissionPlant, action: MonthAction, status?: ReportStatus): Expected {
	const result = checkPermission(users[name], plant, action, status && { status });
	if (!result.allowed) {
		return result.reason;
	}
	return result.actingRole ?? "view";
}

// Plant P05 is owned by Karthik and Priya. Priya is also a reviewer.
const everyoneInNimbus: Record<Name, Expected> = {
	ravi: "view",
	karthik: "view",
	priya: "view",
	vikram: "view",
	meera: "view",
	rohan: "OTHER_COMPANY",
};

const P05_RULES: Record<Exclude<MonthAction, "viewValues">, Record<Name, Expected>> = {
	viewStatus: everyoneInNimbus,
	viewHistory: everyoneInNimbus,
	open: {
		ravi: "NOT_DATA_OWNER",
		karthik: "DATA_OWNER",
		priya: "DATA_OWNER",
		vikram: "NOT_DATA_OWNER",
		meera: "NOT_DATA_OWNER",
		rohan: "OTHER_COMPANY",
	},
	edit: {
		ravi: "NOT_DATA_OWNER",
		karthik: "DATA_OWNER",
		priya: "DATA_OWNER",
		vikram: "NOT_DATA_OWNER",
		meera: "NOT_DATA_OWNER",
		rohan: "OTHER_COMPANY",
	},
	submit: {
		ravi: "NOT_DATA_OWNER",
		karthik: "DATA_OWNER",
		priya: "DATA_OWNER",
		vikram: "NOT_DATA_OWNER",
		meera: "NOT_DATA_OWNER",
		rohan: "OTHER_COMPANY",
	},
	approve: {
		ravi: "NOT_REVIEWER",
		karthik: "NOT_REVIEWER",
		priya: "OWN_PLANT",
		vikram: "REVIEWER",
		meera: "SUSTAINABILITY_HEAD",
		rohan: "OTHER_COMPANY",
	},
	sendBack: {
		ravi: "NOT_REVIEWER",
		karthik: "NOT_REVIEWER",
		priya: "OWN_PLANT",
		vikram: "REVIEWER",
		meera: "SUSTAINABILITY_HEAD",
		rohan: "OTHER_COMPANY",
	},
	reopen: {
		ravi: "NOT_HEAD",
		karthik: "NOT_HEAD",
		priya: "NOT_HEAD",
		vikram: "NOT_HEAD",
		meera: "SUSTAINABILITY_HEAD",
		rohan: "OTHER_COMPANY",
	},
};

describe("the full table for P05", () => {
	const cases = Object.entries(P05_RULES).flatMap(([action, row]) =>
		Object.entries(row).map(([name, expected]) => [action as MonthAction, name as Name, expected] as const),
	);

	it.each(cases)("%s by %s: %s", (action, name, expected) => {
		expect(outcome(name, P05, action)).toBe(expected);
	});
});

describe("seeing a month's current values (R1)", () => {
	const hidden = "VALUES_NOT_SUBMITTED";
	// Columns: DRAFT, SUBMITTED, RETURNED, APPROVED.
	const VALUES: Record<Name, [Expected, Expected, Expected, Expected]> = {
		karthik: ["view", "view", "view", "view"],
		priya: ["view", "view", "view", "view"],
		ravi: [hidden, "view", hidden, "view"],
		vikram: [hidden, "view", hidden, "view"],
		meera: [hidden, "view", hidden, "view"],
		rohan: ["OTHER_COMPANY", "OTHER_COMPANY", "OTHER_COMPANY", "OTHER_COMPANY"],
	};
	const STATUSES: ReportStatus[] = ["DRAFT", "SUBMITTED", "RETURNED", "APPROVED"];
	const cases = Object.entries(VALUES).flatMap(([name, row]) =>
		STATUSES.map((status, index) => [name as Name, status, row[index]] as const),
	);

	it.each(cases)("%s on a %s month: %s", (name, status, expected) => {
		expect(outcome(name, P05, "viewValues", status)).toBe(expected);
	});

	it("keeps a draft's half-typed figures from reviewers and Meera, and says why", () => {
		expect(checkPermission(users.meera, P05, "viewValues", { status: "DRAFT" })).toEqual({
			allowed: false,
			reason: "VALUES_NOT_SUBMITTED",
			message:
				"The plant is still entering this month's figures. You can see them once it is submitted, and earlier submissions in the history.",
		});
	});

	it("still lets them read the status and every earlier submission of a month being fixed", () => {
		expect(outcome("vikram", P05, "viewStatus")).toBe("view");
		expect(outcome("vikram", P05, "viewHistory")).toBe("view");
	});

	it("refuses to decide without knowing the month's status", () => {
		expect(() => checkPermission(users.vikram, P05, "viewValues")).toThrow('needs the month for "viewValues"');
	});
});

describe("the rules the brief and decisions name", () => {
	it("a reviewer cannot act on another company's plant", () => {
		const kestrelReviewer = { id: "k-reviewer", roles: [ROLES.REVIEWER], companyId: KESTREL };
		expect(checkPermission(kestrelReviewer, P01, "approve")).toMatchObject({ allowed: false, reason: "OTHER_COMPANY" });
	});

	it("Priya cannot approve or send back P05, which she owns, but can review P01", () => {
		expect(outcome("priya", P05, "approve")).toBe("OWN_PLANT");
		expect(outcome("priya", P05, "sendBack")).toBe("OWN_PLANT");
		expect(outcome("priya", P01, "approve")).toBe("REVIEWER");
	});

	it("Vikram can approve and send back P05", () => {
		expect(outcome("vikram", P05, "approve")).toBe("REVIEWER");
		expect(outcome("vikram", P05, "sendBack")).toBe("REVIEWER");
	});

	it("Meera can approve and send back, recorded in her Head of Sustainability role", () => {
		expect(outcome("meera", P01, "approve")).toBe("SUSTAINABILITY_HEAD");
		expect(outcome("meera", P01, "sendBack")).toBe("SUSTAINABILITY_HEAD");
	});

	it("only Meera can reopen", () => {
		const reopeners = (Object.keys(users) as Name[]).filter(
			(name) => outcome(name, P01, "reopen") === "SUSTAINABILITY_HEAD",
		);
		expect(reopeners).toEqual(["meera"]);
	});

	it("a data owner cannot enter or submit a plant they don't own", () => {
		expect(outcome("ravi", P05, "submit")).toBe("NOT_DATA_OWNER");
		expect(outcome("ravi", P01, "submit")).toBe("DATA_OWNER");
	});

	it("either of P05's two owners can enter and submit (O8)", () => {
		expect(outcome("karthik", P05, "submit")).toBe("DATA_OWNER");
		expect(outcome("priya", P05, "submit")).toBe("DATA_OWNER");
	});

	it("explains each refusal in words", () => {
		expect(checkPermission(users.priya, P05, "approve")).toEqual({
			allowed: false,
			reason: "OWN_PLANT",
			message: "You are a data owner of this plant, so another reviewer must review this month.",
		});
	});
});

describe("edge cases (R2 to R4)", () => {
	it("R2: a Head who owns a plant's data cannot reopen or approve it", () => {
		const ownerHead = { id: "owner-head", roles: [ROLES.SUSTAINABILITY_HEAD], companyId: NIMBUS };
		const plant = { companyId: NIMBUS, dataOwnerIds: ["owner-head"] };
		expect(checkPermission(ownerHead, plant, "reopen")).toMatchObject({ reason: "OWN_PLANT" });
		expect(checkPermission(ownerHead, plant, "approve")).toMatchObject({ reason: "OWN_PLANT" });
	});

	it("R3: someone who is both reviewer and Head is recorded as reviewer when reviewing", () => {
		const both = { id: "both", roles: [ROLES.SUSTAINABILITY_HEAD, ROLES.REVIEWER], companyId: NIMBUS };
		expect(checkPermission(both, P01, "approve")).toEqual({ allowed: true, actingRole: ROLES.REVIEWER });
		expect(checkPermission(both, P01, "reopen")).toEqual({ allowed: true, actingRole: ROLES.SUSTAINABILITY_HEAD });
	});

	it("R4: being linked to the plant is what lets someone enter data, not the role alone", () => {
		const roleOnly = { id: "role-only", roles: [ROLES.DATA_OWNER], companyId: NIMBUS };
		const linkedNoRole = { id: "linked", roles: [], companyId: NIMBUS };
		const plant = { companyId: NIMBUS, dataOwnerIds: ["linked"] };
		expect(checkPermission(roleOnly, plant, "submit")).toMatchObject({ reason: "NOT_DATA_OWNER" });
		expect(checkPermission(linkedNoRole, plant, "submit")).toEqual({ allowed: true, actingRole: ROLES.DATA_OWNER });
	});
});

describe("requirePermission on the server", () => {
	function refusal(user: PermissionUser, plant: PermissionPlant, action: MonthAction): TRPCError {
		try {
			requirePermission(user, plant, action, { status: "DRAFT" });
		} catch (error) {
			if (error instanceof TRPCError) {
				return error;
			}
			throw error;
		}
		throw new Error("Expected a refusal");
	}

	it("returns the role to record when allowed", () => {
		expect(requirePermission(users.meera, P05, "approve")).toEqual({ actingRole: ROLES.SUSTAINABILITY_HEAD });
	});

	it("hides another company's month as NOT_FOUND", () => {
		expect(refusal(users.rohan, P05, "viewStatus")).toMatchObject({
			code: "NOT_FOUND",
			message: "We could not find this month.",
		});
	});

	it("refuses everything else as FORBIDDEN, with the reason", () => {
		expect(refusal(users.priya, P05, "approve")).toMatchObject({
			code: "FORBIDDEN",
			message: "You are a data owner of this plant, so another reviewer must review this month.",
		});
		expect(requirePermission(users.vikram, P05, "viewValues", { status: "SUBMITTED" })).toEqual({ actingRole: null });
		expect(refusal(users.vikram, P05, "reopen")).toMatchObject({
			code: "FORBIDDEN",
			message: "Only the Head of Sustainability can reopen an approved month.",
		});
	});
});
