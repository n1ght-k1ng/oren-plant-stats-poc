import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ROLES } from "@/lib/roles";
import type { Dashboard } from "@/lib/schemas/dashboard";
import type { LineInput } from "@/lib/schemas/month";
import type { SessionUser } from "@/lib/schemas/session";
import { prisma } from "@/server/db";
import { recordCapacity } from "@/server/services/capacity";
import { getDashboard } from "@/server/services/dashboard";
import { getSessionUser } from "@/server/services/session";

import {
	addDataOwner,
	callerFor,
	createTestCompany,
	createTestPlant,
	createTestUser,
	deleteTestCompany,
} from "./helpers";

// Meera's dashboard (docs/PLAN.md 5.1; O6, N2, V1 to V3): approved figures only, never a zero for anything else.

const line = (itemKey: string, value: string, unit: string): LineInput => ({
	itemKey,
	mode: "value",
	value,
	unit,
	note: null,
});
/** P04's October: 85,251,600 kg Scope 1 and 8,302,500 kg Scope 2. No flags. */
const P04_LINES = [
	line("coal", "11000", "t"),
	line("petcoke", "1500", "t"),
	line("diesel", "95000", "L"),
	line("grid_power", "12300", "MWh"),
	line("clinker", "101700", "t"),
];
/** P01's October: 259,993,200 kg Scope 1 and 3,037,500 kg Scope 2. Two flags. */
const P01_LINES = [
	line("coal", "35000", "t"),
	line("petcoke", "7600", "t"),
	line("diesel", "160000", "L"),
	line("grid_power", "4500", "MWh"),
	line("clinker", "285800", "t"),
];

let companyId: string;
let otherCompanyId: string;
let owner: { id: string };
let reviewer: { id: string };
let head: { id: string };
let outsiderHead: { id: string };
const plants: Record<"A" | "B" | "C", { id: string }> = {} as never;
const months: Record<string, string> = {};

async function plant(code: string) {
	const created = await createTestPlant(companyId, { code, cementCapacityTpa: 4_000_000 });
	await addDataOwner(created.id, owner.id);
	await recordCapacity(prisma, {
		companyId,
		plantId: created.id,
		effectiveFrom: "2026-04",
		cementCapacityTpa: 4_000_000,
		createdById: null,
	});
	return created;
}

async function submit(plantId: string, period: string, lines: LineInput[]) {
	const { reportId } = await callerFor(owner).month.open({ plantId, period });
	await callerFor(owner).month.save({ reportId, expectedVersion: 1, lines });
	await callerFor(owner).month.submit({ reportId, expectedVersion: 2, confirmNotUsed: ["furnace_oil"] });
	return reportId;
}

async function approve(plantId: string, period: string, lines: LineInput[]) {
	const reportId = await submit(plantId, period, lines);
	await callerFor(reviewer).review.approve({ reportId, expectedVersion: 3, comment: "Checked." });
	return reportId;
}

const Q2 = { fyStartYear: 2026, quarter: 2 };
const overview = (by: { id: string }, quarter: typeof Q2 | null = Q2) => callerFor(by).dashboard.overview(quarter);
const row = (dashboard: Dashboard, code: string) => dashboard.plants.find((entry) => entry.plant.code === code);

beforeAll(async () => {
	companyId = (await createTestCompany()).id;
	otherCompanyId = (await createTestCompany()).id;
	owner = await createTestUser(companyId, [ROLES.DATA_OWNER], "Owner");
	reviewer = await createTestUser(companyId, [ROLES.REVIEWER], "Reviewer");
	head = await createTestUser(companyId, [ROLES.SUSTAINABILITY_HEAD], "Head");
	outsiderHead = await createTestUser(otherCompanyId, [ROLES.SUSTAINABILITY_HEAD], "Outsider");
	plants.A = await plant("A");
	plants.B = await plant("B");
	plants.C = await plant("C");

	// A: July and August approved, September waiting for review.
	months.A07 = await approve(plants.A.id, "2026-07", P04_LINES);
	months.A08 = await approve(plants.A.id, "2026-08", P04_LINES);
	months.A09 = await submit(plants.A.id, "2026-09", P04_LINES);
	// B: July approved, then reopened by the Head; August a draft; September not started.
	months.B07 = await approve(plants.B.id, "2026-07", P01_LINES);
	await callerFor(head).review.reopen({ reportId: months.B07, expectedVersion: 4, comment: "Diesel bill query." });
	months.B08 = (await callerFor(owner).month.open({ plantId: plants.B.id, period: "2026-08" })).reportId;
	// C: July (flagged) and September approved; August not started.
	months.C07 = await approve(plants.C.id, "2026-07", P01_LINES);
	months.C09 = await approve(plants.C.id, "2026-09", P04_LINES);

	// Another company's approved month must never appear.
	const otherOwner = await createTestUser(otherCompanyId, [ROLES.DATA_OWNER], "Other owner");
	const otherReviewer = await createTestUser(otherCompanyId, [ROLES.REVIEWER], "Other reviewer");
	const otherPlant = await createTestPlant(otherCompanyId, { code: "X" });
	await addDataOwner(otherPlant.id, otherOwner.id);
	const { reportId } = await callerFor(otherOwner).month.open({ plantId: otherPlant.id, period: "2026-07" });
	await callerFor(otherOwner).month.save({ reportId, expectedVersion: 1, lines: P04_LINES });
	await callerFor(otherOwner).month.submit({ reportId, expectedVersion: 2, confirmNotUsed: ["furnace_oil"] });
	await callerFor(otherReviewer).review.approve({ reportId, expectedVersion: 3, comment: null });
}, 120_000);

afterAll(async () => {
	await deleteTestCompany(companyId);
	await deleteTestCompany(otherCompanyId);
});

describe("approved figures only", () => {
	it("adds up only the months approved now, in kg, exactly", async () => {
		const dashboard = await overview(head);
		// A July + A August + C July + C September. Worked out by hand:
		// Scope 1: 85,251,600 × 3 + 259,993,200 = 515,748,000. Scope 2: 8,302,500 × 3 + 3,037,500 = 27,945,000.
		expect(dashboard.company.approved).toEqual({
			scope1KgCo2: "515748000",
			scope2KgCo2: "27945000",
			totalKgCo2: "543693000",
		});
		expect(dashboard.company).toMatchObject({ approvedMonths: 4, dueMonths: 9, notDue: [] });
	});

	it("never counts a reopened month, though its old approval is kept for the audit trail", async () => {
		const dashboard = await overview(head);
		expect(row(dashboard, "B")?.approved).toBeNull();
		expect(row(dashboard, "B")?.cells[0]).toMatchObject({ period: "2026-07", status: "RETURNED", approved: null });
		expect(await prisma.approvalSnapshot.count({ where: { reportId: months.B07 } })).toBe(1);
	});

	it("shows unapproved months with their status and no number, never a zero", async () => {
		const dashboard = await overview(head);
		const cells = dashboard.plants.flatMap((entry) => entry.cells);
		expect(cells.filter((cell) => cell.status !== "APPROVED").every((cell) => cell.approved === null)).toBe(true);
		expect(row(dashboard, "A")?.cells.map((cell) => [cell.status, cell.approved?.scope1KgCo2 ?? null])).toEqual([
			["APPROVED", "85251600"],
			["APPROVED", "85251600"],
			["SUBMITTED", null],
		]);
		expect(row(dashboard, "C")?.cells[1]).toMatchObject({ status: null, reportId: null, approved: null });
	});

	it("totals each plant from its approved months, and says how many that is", async () => {
		const dashboard = await overview(head);
		expect(row(dashboard, "A")).toMatchObject({
			approvedMonths: 2,
			dueMonths: 3,
			approved: { scope1KgCo2: "170503200", scope2KgCo2: "16605000" },
		});
		expect(row(dashboard, "C")).toMatchObject({ approvedMonths: 2, approved: { scope1KgCo2: "345244800" } });
	});

	it("adds a month to the totals only once it is approved", async () => {
		await callerFor(reviewer).review.approve({ reportId: months.A09, expectedVersion: 3, comment: null });
		const after = await overview(head);
		expect(after.company.approved?.scope1KgCo2).toBe("600999600");
		expect(after.company.approvedMonths).toBe(5);
		// Reopen it again so the other tests see the original state.
		await callerFor(head).review.reopen({ reportId: months.A09, expectedVersion: 4, comment: "Back to the plant." });
		expect((await overview(head)).company.approved?.scope1KgCo2).toBe("515748000");
	});
});

describe("where things stand", () => {
	it("lists every due plant-month that isn't approved, with its status", async () => {
		const dashboard = await overview(head);
		expect(dashboard.company.missing.map((entry) => [entry.plantCode, entry.period, entry.status])).toEqual([
			["A", "2026-09", "RETURNED"],
			["B", "2026-07", "RETURNED"],
			["B", "2026-08", "DRAFT"],
			["B", "2026-09", null],
			["C", "2026-08", null],
		]);
	});

	it("shows how long a submitted month has been waiting", async () => {
		const reportId = await submit(plants.B.id, "2026-09", P04_LINES);
		const cell = row(await overview(head), "B")?.cells[2];
		expect(cell).toMatchObject({ status: "SUBMITTED", reportId });
		expect(cell?.waitingSince).toBeInstanceOf(Date);
		await callerFor(reviewer).review.sendBack({ reportId, expectedVersion: 3, comment: "Not needed for this test." });
	});

	it("doesn't count months that haven't ended as missing", async () => {
		const user = (await getSessionUser(prisma, head.id)) as SessionUser;
		const dashboard = await getDashboard(
			prisma,
			user,
			{ fyStartYear: 2026, quarter: 3 },
			new Date("2026-11-26T08:00:00Z"),
		);
		expect(dashboard.quarter).toMatchObject({ label: "Q3 FY 2026-27", periods: ["2026-10", "2026-11", "2026-12"] });
		expect(dashboard.company).toMatchObject({
			notDue: ["2026-11", "2026-12"],
			dueMonths: 3,
			approvedMonths: 0,
			approved: null,
		});
		expect(dashboard.plants[0].cells.map((cell) => cell.due)).toEqual([true, false, false]);
	});
});

describe("choosing a quarter, and who can see it", () => {
	it("opens on the latest quarter that has any data", async () => {
		expect((await overview(head, null)).quarter.label).toBe("Q2 FY 2026-27");
	});

	it("offers every quarter from the first reporting month, newest first", async () => {
		const user = (await getSessionUser(prisma, head.id)) as SessionUser;
		const dashboard = await getDashboard(prisma, user, null, new Date("2027-02-10T08:00:00Z"));
		expect(dashboard.quarters.map((quarter) => quarter.label)).toEqual([
			"Q4 FY 2026-27",
			"Q3 FY 2026-27",
			"Q2 FY 2026-27",
			"Q1 FY 2026-27",
		]);
	});

	it("is for the Head and reviewers, shows only their company, and is refused to data owners", async () => {
		expect((await overview(reviewer)).company.approvedMonths).toBe(4);
		const outsiders = await overview(outsiderHead);
		expect(outsiders.plants.map((entry) => entry.plant.code)).toEqual(["X"]);
		expect(outsiders.company.approved?.scope1KgCo2).toBe("85251600");
		await expect(overview(owner)).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});
