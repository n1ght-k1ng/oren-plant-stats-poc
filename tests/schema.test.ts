import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ROLES } from "@/lib/roles";
import { prisma } from "@/server/db";

import { createTestCompany, createTestPlant, createTestUser, deleteTestCompany } from "./helpers";

// Database rules for monthly plant data (docs/DECISIONS.md P1, C1).

type Fixture = Awaited<ReturnType<typeof setUp>>;

async function setUp() {
	const company = await createTestCompany();
	const owner = await createTestUser(company.id, [ROLES.DATA_OWNER], "Owner");
	const reviewer = await createTestUser(company.id, [ROLES.REVIEWER], "Reviewer");
	const plant = await createTestPlant(company.id);
	return { company, owner, reviewer, plant };
}

function openReport(fx: Fixture, period: string) {
	return prisma.monthlyReport.create({
		data: {
			companyId: fx.company.id,
			plantId: fx.plant.id,
			period,
			plantType: fx.plant.type,
			openedById: fx.owner.id,
		},
	});
}

/** The Prisma error code for a broken unique constraint. */
async function uniqueViolation(promise: Promise<unknown>) {
	const error = await promise.then(
		() => null,
		(caught: unknown) => caught,
	);
	return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error;
}

let fx: Fixture;
let companyDeleted = false;

beforeAll(async () => {
	fx = await setUp();
});

afterAll(async () => {
	if (!companyDeleted) {
		await deleteTestCompany(fx.company.id);
	}
});

describe("MonthlyReport", () => {
	it("starts as a draft at version 1, keeping the plant type it was opened with", async () => {
		const report = await openReport(fx, "2026-04");
		expect(report).toMatchObject({ status: "DRAFT", version: 1, plantType: "INTEGRATED" });
	});

	it("allows one report per plant and month", async () => {
		await openReport(fx, "2026-05");
		expect(await uniqueViolation(openReport(fx, "2026-05"))).toBe("P2002");
	});
});

describe("ReportLine", () => {
	it("starts as not entered, with no value", async () => {
		const report = await openReport(fx, "2026-06");
		const line = await prisma.reportLine.create({
			data: { companyId: fx.company.id, reportId: report.id, itemKey: "coal" },
		});
		expect(line).toMatchObject({ state: "NOT_ENTERED", value: null, unit: null, source: "FORM" });
	});

	it("allows one line per item in a report", async () => {
		const report = await openReport(fx, "2026-07");
		const line = { companyId: fx.company.id, reportId: report.id, itemKey: "diesel" };
		await prisma.reportLine.create({ data: line });
		expect(await uniqueViolation(prisma.reportLine.create({ data: line }))).toBe("P2002");
	});
});

describe("PlantCapacity", () => {
	it("allows one capacity per plant and effective month", async () => {
		const row = { companyId: fx.company.id, plantId: fx.plant.id, effectiveFrom: "2026-04", cementCapacityTpa: 1_000 };
		await prisma.plantCapacity.create({ data: row });
		expect(await uniqueViolation(prisma.plantCapacity.create({ data: row }))).toBe("P2002");
	});
});

describe("deleting a company", () => {
	it("removes its months, lines, uploads, events, approvals and capacity history", async () => {
		const companyId = fx.company.id;
		const report = await openReport(fx, "2026-08");
		const upload = await prisma.upload.create({
			data: {
				companyId,
				reportId: report.id,
				kind: "PASTE",
				content: "Coal\t100\tt",
				sizeBytes: 11,
				mapping: [],
				uploadedById: fx.owner.id,
			},
		});
		await prisma.reportLine.create({
			data: {
				companyId,
				reportId: report.id,
				itemKey: "coal",
				state: "VALUE",
				value: "100",
				unit: "t",
				enteredValue: "100",
				enteredUnit: "t",
				source: "IMPORT",
				uploadId: upload.id,
				updatedById: fx.owner.id,
			},
		});
		await prisma.reviewEvent.create({
			data: {
				companyId,
				reportId: report.id,
				sequence: 1,
				action: "SUBMIT",
				fromStatus: "DRAFT",
				toStatus: "SUBMITTED",
				actorId: fx.owner.id,
				actorRole: ROLES.DATA_OWNER,
				flags: [],
			},
		});
		const approve = await prisma.reviewEvent.create({
			data: {
				companyId,
				reportId: report.id,
				sequence: 2,
				action: "APPROVE",
				fromStatus: "SUBMITTED",
				toStatus: "APPROVED",
				actorId: fx.reviewer.id,
				actorRole: ROLES.REVIEWER,
			},
		});
		await prisma.approvalSnapshot.create({
			data: { companyId, reportId: report.id, eventId: approve.id, scope1KgCo2: "244100", scope2KgCo2: "0", lines: [] },
		});

		await deleteTestCompany(companyId);
		companyDeleted = true;

		const where = { companyId };
		const remaining = await Promise.all([
			prisma.monthlyReport.count({ where }),
			prisma.reportLine.count({ where }),
			prisma.upload.count({ where }),
			prisma.reviewEvent.count({ where }),
			prisma.approvalSnapshot.count({ where }),
			prisma.plantCapacity.count({ where }),
		]);
		expect(remaining).toEqual([0, 0, 0, 0, 0, 0]);
	});
});
