import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sumDecimals, toDecimalString } from "@/lib/decimal";
import { ROLES } from "@/lib/roles";
import { type ApprovalLine, type SubmittedLine, approvalLines, submittedLines } from "@/lib/schemas/report";
import { prisma } from "@/server/db";

import { createTestCompany, createTestPlant, createTestUser, deleteTestCompany } from "./helpers";

// What each reviewer saw (F1) and what each approval counted (F2). docs/DECISIONS.md

const firstSubmission: SubmittedLine[] = [
	{
		itemKey: "grid_power",
		state: "VALUE",
		value: "12300",
		unit: "MWh",
		enteredValue: "1,23,00,000",
		enteredUnit: "kWh",
		note: "As per bill",
		source: "IMPORT",
		uploadId: "upload-1",
	},
	{
		itemKey: "furnace_oil",
		state: "NA",
		naReason: "NOT_USED_THIS_MONTH",
		enteredValue: null,
		enteredUnit: null,
		note: null,
		source: "FORM",
		uploadId: null,
	},
];

const secondSubmission: SubmittedLine[] = [
	{
		...firstSubmission[0],
		value: "12030",
		enteredValue: "12030",
		enteredUnit: "MWh",
		note: "Corrected: the bill was misread",
		source: "FORM",
		uploadId: null,
	} as SubmittedLine,
	firstSubmission[1],
];

const IPCC = { factorSource: "IPCC 2006 Guidelines", factorYear: "2006", scope: 1 as const };
const approved: ApprovalLine[] = [
	{
		itemKey: "diesel",
		state: "VALUE",
		value: "95000.5",
		unit: "L",
		factorKey: "diesel",
		kgCo2PerUnit: "2.68",
		...IPCC,
		kgCo2: "254601.34",
	},
	{
		itemKey: "coal",
		state: "VALUE",
		value: "11000",
		unit: "t",
		factorKey: "coal",
		kgCo2PerUnit: "2441",
		...IPCC,
		kgCo2: "26851000",
	},
	{
		itemKey: "grid_power",
		state: "VALUE",
		value: "12030",
		unit: "MWh",
		factorKey: "grid_power",
		kgCo2PerUnit: "675",
		factorSource: "CEA CO2 Baseline Database, version 22.0",
		factorYear: "FY 2025-26",
		scope: 2,
		kgCo2: "8120250",
	},
	{ itemKey: "furnace_oil", state: "NA", naReason: "NOT_USED_THIS_MONTH" },
];

describe("submittedLines", () => {
	it("accepts lines in every state, with what was typed", () => {
		expect(submittedLines.safeParse(firstSubmission).success).toBe(true);
		expect(submittedLines.safeParse([{ ...firstSubmission[1], state: "NOT_ENTERED" }]).success).toBe(true);
	});

	it("rejects a value stored as a JSON number, a value line without its value, and N/A without a reason", () => {
		const [value, na] = firstSubmission;
		expect(submittedLines.safeParse([{ ...value, value: 12300 }]).success).toBe(false);
		expect(submittedLines.safeParse([{ ...value, value: undefined }]).success).toBe(false);
		expect(submittedLines.safeParse([{ ...na, naReason: undefined }]).success).toBe(false);
	});
});

describe("approvalLines", () => {
	it("records the item, canonical value and unit, factor value, source and year, and the CO2", () => {
		expect(approvalLines.safeParse(approved).success).toBe(true);
	});

	it("rejects a line missing any of them", () => {
		const line = approved[0];
		for (const field of ["value", "unit", "kgCo2PerUnit", "factorSource", "factorYear", "kgCo2"] as const) {
			const { [field]: _removed, ...incomplete } = line as Record<string, unknown>;
			expect(approvalLines.safeParse([incomplete]).success, `without ${field}`).toBe(false);
		}
	});

	it("rejects CO2 as a JSON number, and a line that was never entered", () => {
		expect(approvalLines.safeParse([{ ...approved[0], kgCo2: 254601.34 }]).success).toBe(false);
		expect(approvalLines.safeParse([{ itemKey: "coal", state: "NOT_ENTERED" }]).success).toBe(false);
	});
});

describe("in the database", () => {
	let companyId: string;
	let reportId: string;
	let owner: { id: string };
	let reviewer: { id: string };

	beforeAll(async () => {
		const company = await createTestCompany();
		companyId = company.id;
		owner = await createTestUser(companyId, [ROLES.DATA_OWNER], "Owner");
		reviewer = await createTestUser(companyId, [ROLES.REVIEWER], "Reviewer");
		const plant = await createTestPlant(companyId);
		const report = await prisma.monthlyReport.create({
			data: { companyId, plantId: plant.id, period: "2026-10", plantType: plant.type, openedById: owner.id },
		});
		reportId = report.id;
	});

	afterAll(async () => {
		await deleteTestCompany(companyId);
	});

	let sequence = 0;
	function event(action: "SUBMIT" | "SEND_BACK" | "APPROVE", lines?: SubmittedLine[]) {
		sequence += 1;
		const [fromStatus, toStatus] = {
			SUBMIT: ["DRAFT", "SUBMITTED"] as const,
			SEND_BACK: ["SUBMITTED", "RETURNED"] as const,
			APPROVE: ["SUBMITTED", "APPROVED"] as const,
		}[action];
		const byOwner = action === "SUBMIT";
		return prisma.reviewEvent.create({
			data: {
				companyId,
				reportId,
				sequence,
				action,
				fromStatus,
				toStatus,
				actorId: byOwner ? owner.id : reviewer.id,
				actorRole: byOwner ? ROLES.DATA_OWNER : ROLES.REVIEWER,
				comment: action === "SEND_BACK" ? "Power looks high, check the bill" : null,
				...(lines ? { lines, flags: [] } : {}),
			},
		});
	}

	it("keeps each submission's lines, so the history can show what changed between them", async () => {
		await event("SUBMIT", firstSubmission);
		await event("SEND_BACK");
		await event("SUBMIT", secondSubmission);

		const submissions = await prisma.reviewEvent.findMany({
			where: { reportId, action: "SUBMIT" },
			orderBy: { sequence: "asc" },
		});
		const [first, second] = submissions.map((submission) => submittedLines.parse(submission.lines));
		expect(first).toEqual(firstSubmission);
		expect(second).toEqual(secondSubmission);

		const stateOrValue = (lines: SubmittedLine[], key: string) => {
			const line = lines.find((candidate) => candidate.itemKey === key);
			return line?.state === "VALUE" ? line.value : line?.state;
		};
		const changed = first
			.map((line) => line.itemKey)
			.filter((key) => stateOrValue(first, key) !== stateOrValue(second, key));
		expect(changed).toEqual(["grid_power"]);
	});

	it("cannot record two events with the same place in a month's history", async () => {
		const duplicate = prisma.reviewEvent.create({
			data: {
				companyId,
				reportId,
				sequence: 1,
				action: "SUBMIT",
				fromStatus: "DRAFT",
				toStatus: "SUBMITTED",
				actorId: owner.id,
				actorRole: ROLES.DATA_OWNER,
			},
		});
		await expect(duplicate).rejects.toMatchObject({ code: "P2002" });
	});

	it("is not changed by later edits to the month's lines", async () => {
		await prisma.reportLine.create({
			data: { companyId, reportId, itemKey: "grid_power", state: "VALUE", value: "99999", unit: "MWh" },
		});
		const [first] = await prisma.reviewEvent.findMany({
			where: { reportId, action: "SUBMIT" },
			orderBy: { sequence: "asc" },
		});
		expect(submittedLines.parse(first.lines)[0]).toMatchObject({ value: "12300" });
	});

	it("stores an approval whose lines add up exactly to its Scope 1 and Scope 2 totals", async () => {
		const approve = await event("APPROVE");
		await prisma.approvalSnapshot.create({
			data: {
				companyId,
				reportId,
				eventId: approve.id,
				scope1KgCo2: "27105601.34",
				scope2KgCo2: "8120250",
				lines: approved,
			},
		});

		const snapshot = await prisma.approvalSnapshot.findUniqueOrThrow({ where: { eventId: approve.id } });
		const lines = approvalLines.parse(snapshot.lines);
		expect(lines).toEqual(approved);

		const scopeTotal = (scope: 1 | 2) =>
			toDecimalString(
				sumDecimals(lines.flatMap((line) => (line.state === "VALUE" && line.scope === scope ? [line.kgCo2] : []))),
			);
		expect(scopeTotal(1)).toBe(toDecimalString(snapshot.scope1KgCo2));
		expect(scopeTotal(2)).toBe(toDecimalString(snapshot.scope2KgCo2));
	});
});
