import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ROLES } from "@/lib/roles";
import type { SubmittedLine } from "@/lib/schemas/report";
import type { SessionUser } from "@/lib/schemas/session";
import { prisma } from "@/server/db";
import { getSessionUser } from "@/server/services/session";
import {
	MONTH_CONFLICT_MESSAGE,
	type TransitionRequest,
	inMonthTransaction,
	recordTransition,
} from "@/server/services/transition";

import { createTestCompany, createTestPlant, createTestUser, deleteTestCompany } from "./helpers";

// Recording status changes, and what happens when two people act at once (O1, F1, F4).

const lines: SubmittedLine[] = [
	{
		itemKey: "diesel",
		state: "VALUE",
		value: "95000",
		unit: "L",
		enteredValue: "95",
		enteredUnit: "KL",
		note: null,
		source: "FORM",
		uploadId: null,
	},
];

let companyId: string;
let otherCompanyId: string;
let owner: SessionUser;
let reviewer: SessionUser;
let secondReviewer: SessionUser;
let outsider: SessionUser;
let plantId: string;
let reportId: string;
let period = 0;

async function sessionUser(id: string) {
	const user = await getSessionUser(prisma, id);
	if (!user) {
		throw new Error("Test user is missing");
	}
	return user;
}

function act(user: SessionUser, request: Omit<TransitionRequest, "reportId"> & { reportId?: string }) {
	return inMonthTransaction(prisma, (tx) => recordTransition(tx, user, { reportId, ...request }));
}

const submit = (expectedVersion: number) =>
	act(owner, {
		expectedVersion,
		action: "submit",
		actorRole: ROLES.DATA_OWNER,
		hasFlags: false,
		frozen: { lines, flags: [] },
	});

/** The error a call rejected with. Fails the test if it did not reject. */
async function rejection(promise: Promise<unknown>): Promise<TRPCError> {
	const outcome = await promise.then(
		() => new Error("Expected the call to be rejected"),
		(error: unknown) => error,
	);
	if (!(outcome instanceof TRPCError)) {
		throw outcome;
	}
	return outcome;
}

async function stored() {
	const report = await prisma.monthlyReport.findUniqueOrThrow({ where: { id: reportId } });
	const events = await prisma.reviewEvent.findMany({ where: { reportId }, orderBy: { sequence: "asc" } });
	return { status: report.status, version: report.version, events };
}

beforeAll(async () => {
	const company = await createTestCompany();
	const otherCompany = await createTestCompany();
	companyId = company.id;
	otherCompanyId = otherCompany.id;
	owner = await sessionUser((await createTestUser(companyId, [ROLES.DATA_OWNER], "Owner")).id);
	reviewer = await sessionUser((await createTestUser(companyId, [ROLES.REVIEWER], "Reviewer")).id);
	secondReviewer = await sessionUser((await createTestUser(companyId, [ROLES.REVIEWER], "Second reviewer")).id);
	outsider = await sessionUser((await createTestUser(otherCompanyId, [ROLES.SUSTAINABILITY_HEAD], "Outsider")).id);
	plantId = (await createTestPlant(companyId)).id;
});

beforeEach(async () => {
	// A fresh month for each test.
	period += 1;
	const report = await prisma.monthlyReport.create({
		data: {
			companyId,
			plantId,
			period: `2026-${String(period).padStart(2, "0")}`,
			plantType: "INTEGRATED",
			openedById: owner.id,
		},
	});
	reportId = report.id;
});

afterAll(async () => {
	await deleteTestCompany(companyId);
	await deleteTestCompany(otherCompanyId);
});

describe("recordTransition", () => {
	it("records each step in order, with who acted, in which role, and why", async () => {
		await submit(1);
		await act(reviewer, {
			expectedVersion: 2,
			action: "sendBack",
			actorRole: ROLES.REVIEWER,
			comment: "  Diesel looks low  ",
			hasFlags: false,
		});
		await submit(3);
		await act(reviewer, { expectedVersion: 4, action: "approve", actorRole: ROLES.REVIEWER, hasFlags: false });

		const { status, version, events } = await stored();
		expect(status).toBe("APPROVED");
		expect(version).toBe(5);
		expect(events.map((event) => [event.sequence, event.action, event.fromStatus, event.toStatus])).toEqual([
			[1, "SUBMIT", "DRAFT", "SUBMITTED"],
			[2, "SEND_BACK", "SUBMITTED", "RETURNED"],
			[3, "SUBMIT", "RETURNED", "SUBMITTED"],
			[4, "APPROVE", "SUBMITTED", "APPROVED"],
		]);
		expect(events[1]).toMatchObject({ actorId: reviewer.id, actorRole: "REVIEWER", comment: "Diesel looks low" });
		expect(events[0].lines).toEqual(lines);
		expect(events[0].flags).toEqual([]);
	});

	it("refuses a submission that does not freeze its lines", async () => {
		await expect(
			act(owner, { expectedVersion: 1, action: "submit", actorRole: ROLES.DATA_OWNER, hasFlags: false }),
		).rejects.toThrow("A submission must freeze its lines and flags");
		expect((await stored()).events).toHaveLength(0);
	});

	it("refuses a move the status does not allow, in words, and writes nothing", async () => {
		const error = await rejection(
			act(reviewer, { expectedVersion: 1, action: "approve", actorRole: ROLES.REVIEWER, hasFlags: false }),
		);
		expect(error).toMatchObject({ code: "BAD_REQUEST", message: "You can't approve a month that is draft." });
		expect(await stored()).toMatchObject({ status: "DRAFT", version: 1, events: [] });
	});

	it("hides another company's month", async () => {
		const error = await rejection(
			act(outsider, { expectedVersion: 1, action: "submit", actorRole: ROLES.DATA_OWNER, hasFlags: false }),
		);
		expect(error.code).toBe("NOT_FOUND");
	});
});

describe("when two people act on the same month", () => {
	it("tells the second person to reload when they acted on an old version", async () => {
		await submit(1);
		await act(reviewer, { expectedVersion: 2, action: "approve", actorRole: ROLES.REVIEWER, hasFlags: false });

		// The second reviewer loaded the month at version 2, before the approval.
		const error = await rejection(
			act(secondReviewer, {
				expectedVersion: 2,
				action: "sendBack",
				actorRole: ROLES.REVIEWER,
				comment: "Check coal",
				hasFlags: false,
			}),
		);
		expect(error).toMatchObject({ code: "CONFLICT", message: MONTH_CONFLICT_MESSAGE });
		expect(getHTTPStatusCodeFromError(error)).toBe(409);
		expect(await stored()).toMatchObject({ status: "APPROVED", version: 3 });
	});

	it("turns a clash over the history's sequence number into the same conflict, not a server error", async () => {
		// The version check normally stops a second writer first (see the next test). The unique sequence is the
		// backstop: if two events ever claim the same place, the user must still get a conflict, not a 500.
		const event = (sequence: number) => ({
			companyId,
			reportId,
			sequence,
			action: "SEND_BACK" as const,
			fromStatus: "SUBMITTED" as const,
			toStatus: "RETURNED" as const,
			actorId: reviewer.id,
			actorRole: ROLES.REVIEWER,
			comment: "Clashing write",
		});
		const error = await rejection(
			inMonthTransaction(prisma, async (tx) => {
				await tx.reviewEvent.create({ data: event(1) });
				await tx.reviewEvent.create({ data: event(1) });
			}),
		);
		expect(error).toMatchObject({ code: "CONFLICT", message: MONTH_CONFLICT_MESSAGE });
		expect(getHTTPStatusCodeFromError(error)).toBe(409);
		// The transaction rolled back: neither event was kept.
		expect((await stored()).events).toHaveLength(0);
	});

	it("leaves other database errors alone, so real bugs are not hidden as conflicts", async () => {
		const duplicateMonth = inMonthTransaction(prisma, async (tx) => {
			const report = await tx.monthlyReport.findUniqueOrThrow({ where: { id: reportId } });
			await tx.monthlyReport.create({
				data: { companyId, plantId, period: report.period, plantType: "INTEGRATED", openedById: owner.id },
			});
		});
		await expect(duplicateMonth).rejects.toMatchObject({ code: "P2002" });
	});

	it("lets exactly one of two simultaneous actions through", async () => {
		await submit(1);
		const outcomes = await Promise.allSettled([
			act(reviewer, { expectedVersion: 2, action: "approve", actorRole: ROLES.REVIEWER, hasFlags: false }),
			act(secondReviewer, {
				expectedVersion: 2,
				action: "sendBack",
				actorRole: ROLES.REVIEWER,
				comment: "Check coal",
				hasFlags: false,
			}),
		]);

		const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
		const rejected = outcomes.flatMap((outcome) => (outcome.status === "rejected" ? [outcome.reason] : []));
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect(rejected[0]).toMatchObject({ code: "CONFLICT", message: MONTH_CONFLICT_MESSAGE });

		const { version, events } = await stored();
		expect(version).toBe(3);
		expect(events.map((event) => event.sequence)).toEqual([1, 2]);
	});
});
