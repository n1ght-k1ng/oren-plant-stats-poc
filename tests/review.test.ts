import type { TRPCError } from "@trpc/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ROLES } from "@/lib/roles";
import type { LineInput } from "@/lib/schemas/month";
import { approvalLines } from "@/lib/schemas/report";
import { prisma } from "@/server/db";
import { recordCapacity } from "@/server/services/capacity";

import {
	addDataOwner,
	callerFor,
	createTestCompany,
	createTestPlant,
	createTestUser,
	deleteTestCompany,
} from "./helpers";

// Flow 2 (review) and Flow 3 (fix and resubmit) through the API (docs/PLAN.md 3.4, 3.6).

let companyId: string;
let otherCompanyId: string;
let owner: { id: string };
let reviewer: { id: string };
let ownerReviewer: { id: string };
let head: { id: string };
let outsider: { id: string };
let plantNumber = 0;

const line = (itemKey: string, value: string, unit: string, note: string | null = null): LineInput => ({
	itemKey,
	mode: "value",
	value,
	unit,
	note,
});

/** P01's October 2026: two flags (4.02 GJ/t, 15.75 kWh/t). Furnace oil confirmed not used. */
const P01_LINES = [
	line("coal", "35000", "t"),
	line("petcoke", "7600", "t"),
	line("diesel", "160000", "L"),
	line("grid_power", "4500", "MWh"),
	line("clinker", "285800", "t"),
];

/** P04's October 2026: no flags. */
const P04_LINES = [
	line("coal", "11000", "t"),
	line("petcoke", "1500", "t"),
	line("diesel", "95", "kL"),
	line("grid_power", "1,23,00,000", "kWh"),
	line("clinker", "101700", "t"),
];

async function newPlant(capacityTpa: number, owners: { id: string }[] = [owner]) {
	plantNumber += 1;
	const plant = await createTestPlant(companyId, { code: `R${plantNumber}`, cementCapacityTpa: capacityTpa });
	for (const dataOwner of owners) {
		await addDataOwner(plant.id, dataOwner.id);
	}
	await recordCapacity(prisma, {
		companyId,
		plantId: plant.id,
		effectiveFrom: "2026-04",
		cementCapacityTpa: capacityTpa,
		createdById: null,
	});
	return plant;
}

/** Opens, fills and submits a month as `by`. Returns its id; its version is then 3. */
async function submitted(plantId: string, period: string, lines: LineInput[], by: { id: string } = owner) {
	const { reportId } = await callerFor(by).month.open({ plantId, period });
	await callerFor(by).month.save({ reportId, expectedVersion: 1, lines });
	await callerFor(by).month.submit({ reportId, expectedVersion: 2, confirmNotUsed: ["furnace_oil"] });
	return reportId;
}

async function rejection(promise: Promise<unknown>): Promise<TRPCError> {
	const outcome = await promise.then(
		() => new Error("Expected the call to be rejected"),
		(error: unknown) => error,
	);
	if (outcome instanceof Error && "code" in outcome) {
		return outcome as TRPCError;
	}
	throw outcome;
}

beforeAll(async () => {
	companyId = (await createTestCompany()).id;
	otherCompanyId = (await createTestCompany()).id;
	owner = await createTestUser(companyId, [ROLES.DATA_OWNER], "Ravi");
	reviewer = await createTestUser(companyId, [ROLES.REVIEWER], "Vikram");
	ownerReviewer = await createTestUser(companyId, [ROLES.REVIEWER, ROLES.DATA_OWNER], "Priya");
	head = await createTestUser(companyId, [ROLES.SUSTAINABILITY_HEAD], "Meera");
	outsider = await createTestUser(otherCompanyId, [ROLES.REVIEWER], "Outsider");
});

afterAll(async () => {
	await deleteTestCompany(companyId);
	await deleteTestCompany(otherCompanyId);
});

describe("the review queue", () => {
	it("lists submitted months only, flagged ones first, then the longest waiting", async () => {
		const quiet = await newPlant(2_500_000);
		const flagged = await newPlant(4_000_000);
		const draftPlant = await newPlant(2_500_000);
		const quietMonth = await submitted(quiet.id, "2026-10", P04_LINES);
		const flaggedMonth = await submitted(flagged.id, "2026-10", P01_LINES);
		await callerFor(owner).month.open({ plantId: draftPlant.id, period: "2026-10" });

		const queue = await callerFor(reviewer).review.queue();
		const ours = queue.filter((entry) => [quietMonth, flaggedMonth].includes(entry.reportId));
		expect(ours.map((entry) => [entry.reportId, entry.warningCount])).toEqual([
			[flaggedMonth, 2],
			[quietMonth, 0],
		]);
		expect(queue.some((entry) => entry.plant.id === draftPlant.id)).toBe(false);
		expect(ours[0]).toMatchObject({ submittedBy: "Ravi", canReview: true, blockedReason: null, period: "2026-10" });
	});

	it("shows a reviewer the months they own data for, marked for another reviewer", async () => {
		const priyasPlant = await newPlant(2_500_000, [ownerReviewer]);
		const reportId = await submitted(priyasPlant.id, "2026-10", P04_LINES, ownerReviewer);
		const entry = (await callerFor(ownerReviewer).review.queue()).find((candidate) => candidate.reportId === reportId);
		expect(entry).toMatchObject({
			canReview: false,
			blockedReason: "You are a data owner of this plant, so another reviewer must review this month.",
		});
	});

	it("is empty for data owners and never shows another company's months", async () => {
		expect(await callerFor(owner).review.queue()).toEqual([]);
		expect(await callerFor(outsider).review.queue()).toEqual([]);
	});
});

describe("approving", () => {
	it("needs a comment for a flagged month, then records the approval and its CO2", async () => {
		const plant = await newPlant(4_000_000);
		const reportId = await submitted(plant.id, "2026-10", P01_LINES);

		expect(
			await rejection(callerFor(reviewer).review.approve({ reportId, expectedVersion: 3, comment: null })),
		).toMatchObject({
			code: "BAD_REQUEST",
			message: "This month has flags. Add a comment explaining why the flagged values are accepted.",
		});

		const approved = await callerFor(reviewer).review.approve({
			reportId,
			expectedVersion: 3,
			comment: "Figures match the plant's records.",
		});
		expect(approved).toEqual({ status: "APPROVED", version: 4 });

		const event = await prisma.reviewEvent.findFirstOrThrow({ where: { reportId, action: "APPROVE" } });
		expect(event).toMatchObject({
			sequence: 2,
			actorId: reviewer.id,
			actorRole: "REVIEWER",
			comment: "Figures match the plant's records.",
		});
		const snapshot = await prisma.approvalSnapshot.findUniqueOrThrow({ where: { eventId: event.id } });
		// The figures confirmed by hand for P01's October.
		expect(snapshot.scope1KgCo2.toFixed()).toBe("259993200");
		expect(snapshot.scope2KgCo2.toFixed()).toBe("3037500");
		const lines = approvalLines.parse(snapshot.lines);
		expect(lines.find((entry) => entry.itemKey === "grid_power")).toMatchObject({
			kgCo2PerUnit: "675",
			factorYear: "FY 2025-26",
			kgCo2: "3037500",
		});
	});

	it("approves an unflagged month without a comment", async () => {
		const plant = await newPlant(2_500_000);
		const reportId = await submitted(plant.id, "2026-10", P04_LINES);
		await callerFor(reviewer).review.approve({ reportId, expectedVersion: 3, comment: null });
		const snapshot = await prisma.approvalSnapshot.findFirstOrThrow({ where: { reportId } });
		expect(snapshot.scope1KgCo2.toFixed()).toBe("85251600");
		expect(snapshot.scope2KgCo2.toFixed()).toBe("8302500");
	});

	it("counts what was submitted, even if a line changes in the database afterwards", async () => {
		const plant = await newPlant(2_500_000);
		const reportId = await submitted(plant.id, "2026-10", P04_LINES);
		await prisma.reportLine.updateMany({ where: { reportId, itemKey: "coal" }, data: { value: "99999" } });
		await callerFor(reviewer).review.approve({ reportId, expectedVersion: 3, comment: null });
		const snapshot = await prisma.approvalSnapshot.findFirstOrThrow({ where: { reportId } });
		expect(approvalLines.parse(snapshot.lines).find((entry) => entry.itemKey === "coal")).toMatchObject({
			value: "11000",
		});
	});

	it("records Meera's approval in her Head of Sustainability role", async () => {
		const plant = await newPlant(2_500_000);
		const reportId = await submitted(plant.id, "2026-10", P04_LINES);
		await callerFor(head).review.approve({ reportId, expectedVersion: 3, comment: null });
		expect(await prisma.reviewEvent.findFirstOrThrow({ where: { reportId, action: "APPROVE" } })).toMatchObject({
			actorRole: "SUSTAINABILITY_HEAD",
		});
	});

	it("refuses the plant's own data owner, a data owner without the reviewer role, and another company", async () => {
		const priyasPlant = await newPlant(2_500_000, [ownerReviewer]);
		const priyasMonth = await submitted(priyasPlant.id, "2026-10", P04_LINES, ownerReviewer);
		const approve = (by: { id: string }, reportId: string) =>
			callerFor(by).review.approve({ reportId, expectedVersion: 3, comment: "OK" });

		expect(await rejection(approve(ownerReviewer, priyasMonth))).toMatchObject({ code: "FORBIDDEN" });
		const plant = await newPlant(2_500_000);
		const reportId = await submitted(plant.id, "2026-10", P04_LINES);
		expect(await rejection(approve(owner, reportId))).toMatchObject({ code: "FORBIDDEN" });
		expect(await rejection(approve(outsider, reportId))).toMatchObject({ code: "NOT_FOUND" });
		expect(await prisma.approvalSnapshot.count({ where: { reportId: { in: [reportId, priyasMonth] } } })).toBe(0);
	});

	it("tells the second of two reviewers to reload, and never approves twice", async () => {
		const plant = await newPlant(2_500_000);
		const reportId = await submitted(plant.id, "2026-10", P04_LINES);
		await callerFor(reviewer).review.approve({ reportId, expectedVersion: 3, comment: null });
		expect(
			await rejection(callerFor(head).review.approve({ reportId, expectedVersion: 3, comment: null })),
		).toMatchObject({
			code: "CONFLICT",
		});
		expect(
			await rejection(callerFor(head).review.approve({ reportId, expectedVersion: 4, comment: null })),
		).toMatchObject({
			code: "BAD_REQUEST",
			message: "You can't approve a month that is approved.",
		});
		expect(await prisma.approvalSnapshot.count({ where: { reportId } })).toBe(1);
	});
});

describe("sending back, fixing and resubmitting (Flow 3)", () => {
	it("needs a comment to send back", async () => {
		const plant = await newPlant(4_000_000);
		const reportId = await submitted(plant.id, "2026-10", P01_LINES);
		expect(
			await rejection(callerFor(reviewer).review.sendBack({ reportId, expectedVersion: 3, comment: "  " })),
		).toMatchObject({ code: "BAD_REQUEST", message: "Add a comment saying what needs fixing." });
	});

	it("returns the month to its owner with the comment, then shows what changed when it is resubmitted", async () => {
		const plant = await newPlant(4_000_000);
		const reportId = await submitted(plant.id, "2026-10", P01_LINES);

		await callerFor(reviewer).review.sendBack({
			reportId,
			expectedVersion: 3,
			comment: "Grid power looks low against last year. Please check the bill.",
		});
		const returned = await callerFor(owner).month.byId({ reportId });
		expect(returned).toMatchObject({
			status: "RETURNED",
			reopened: false,
			canEdit: true,
			returnComment: { text: "Grid power looks low against last year. Please check the bill.", by: "Vikram" },
		});
		expect((await callerFor(reviewer).review.queue()).some((entry) => entry.reportId === reportId)).toBe(false);

		await callerFor(owner).month.save({
			reportId,
			expectedVersion: 4,
			lines: [line("grid_power", "4,620", "MWh", "Bill rechecked: 4,620 MWh")],
		});
		expect(await callerFor(owner).month.submit({ reportId, expectedVersion: 5, confirmNotUsed: [] })).toEqual({
			status: "SUBMITTED",
			version: 6,
		});

		const resubmitted = await callerFor(reviewer).month.byId({ reportId });
		expect(resubmitted.history.map((event) => [event.action, event.actorName])).toEqual([
			["SUBMIT", "Ravi"],
			["SEND_BACK", "Vikram"],
			["SUBMIT", "Ravi"],
		]);
		expect(resubmitted.history[0].changes).toEqual([]);
		expect(resubmitted.history[2].changes).toEqual([
			{ itemKey: "grid_power", label: "Grid electricity", from: "4,500 MWh", to: "4,620 MWh" },
			{ itemKey: "grid_power", label: "Grid electricity note", from: "none", to: "Bill rechecked: 4,620 MWh" },
		]);
		expect(resubmitted.review).toEqual({ canReview: true, blockedReason: null });

		await callerFor(reviewer).review.approve({ reportId, expectedVersion: 6, comment: "Rechecked bill accepted." });
		expect((await callerFor(owner).month.byId({ reportId })).status).toBe("APPROVED");
	});
});

describe("last month's values beside this month's (3.5b)", () => {
	it("gives the reviewer the plant's last approved month, and flags a large change from it", async () => {
		const plant = await newPlant(2_500_000);
		const september = await submitted(plant.id, "2026-09", P04_LINES);
		await callerFor(reviewer).review.approve({ reportId: september, expectedVersion: 3, comment: null });

		const higherPower = P04_LINES.map((entry) =>
			entry.itemKey === "grid_power" ? line("grid_power", "17,500", "MWh") : entry,
		);
		const october = await submitted(plant.id, "2026-10", higherPower);
		const view = await callerFor(reviewer).month.byId({ reportId: october });
		expect(view.checkContext.previous).toMatchObject({
			period: "2026-09",
			lines: {
				grid_power: { state: "VALUE", value: "12300" },
				coal: { state: "VALUE", value: "11000" },
				// With its reason, so last month's column words it as this month's does (U35).
				furnace_oil: { state: "NA", naReason: "NOT_USED_THIS_MONTH" },
			},
		});
		expect(view.flags.find((flag) => flag.code === "LARGE_CHANGE")).toMatchObject({
			itemKeys: ["grid_power"],
			message: "Grid electricity changed by +42.28% from September 2026, the last approved month.",
		});
	});
});

describe("reopening an approved month (3.7)", () => {
	async function approvedMonth() {
		const plant = await newPlant(2_500_000);
		const reportId = await submitted(plant.id, "2026-10", P04_LINES);
		await callerFor(reviewer).review.approve({ reportId, expectedVersion: 3, comment: null });
		return reportId;
	}

	it("is for the Head of Sustainability only, and needs a reason", async () => {
		const reportId = await approvedMonth();
		expect((await callerFor(head).month.byId({ reportId })).canReopen).toBe(true);
		expect((await callerFor(reviewer).month.byId({ reportId })).canReopen).toBe(false);
		expect(
			await rejection(callerFor(reviewer).review.reopen({ reportId, expectedVersion: 4, comment: "Wrong bill" })),
		).toMatchObject({ code: "FORBIDDEN", message: "Only the Head of Sustainability can reopen an approved month." });
		expect(
			await rejection(callerFor(head).review.reopen({ reportId, expectedVersion: 4, comment: " " })),
		).toMatchObject({
			code: "BAD_REQUEST",
			message: "Add a reason for reopening this month.",
		});
	});

	it("returns it to the owner as RETURNED with the reason, keeps the earlier approval, and approves again", async () => {
		const reportId = await approvedMonth();
		await callerFor(head).review.reopen({
			reportId,
			expectedVersion: 4,
			comment: "The auditor found the diesel bill was for two months.",
		});

		const returned = await callerFor(owner).month.byId({ reportId });
		expect(returned).toMatchObject({
			status: "RETURNED",
			reopened: true,
			canEdit: true,
			returnComment: { action: "REOPEN", text: "The auditor found the diesel bill was for two months.", by: "Meera" },
		});
		// U23: shown as "Reopened" in the owner's list too, not as a reviewer's send-back.
		const listed = (await callerFor(owner).month.mine()).flatMap((entry) => entry.months);
		expect(listed.find((month) => month.reportId === reportId)).toMatchObject({ status: "RETURNED", reopened: true });
		const reopenEvent = await prisma.reviewEvent.findFirstOrThrow({ where: { reportId, action: "REOPEN" } });
		expect(reopenEvent).toMatchObject({
			fromStatus: "APPROVED",
			toStatus: "RETURNED",
			actorRole: "SUSTAINABILITY_HEAD",
		});
		expect(await prisma.approvalSnapshot.count({ where: { reportId } })).toBe(1);

		await callerFor(owner).month.save({ reportId, expectedVersion: 5, lines: [line("diesel", "47.5", "kL")] });
		await callerFor(owner).month.submit({ reportId, expectedVersion: 6, confirmNotUsed: [] });
		await callerFor(reviewer).review.approve({ reportId, expectedVersion: 7, comment: null });

		const snapshots = await prisma.approvalSnapshot.findMany({ where: { reportId }, orderBy: { createdAt: "asc" } });
		expect(snapshots.map((snapshot) => snapshot.scope1KgCo2.toFixed())).toEqual(["85251600", "85124300"]);
	});
});
