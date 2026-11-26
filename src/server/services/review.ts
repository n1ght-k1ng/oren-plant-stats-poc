/**
 * Flow 2: a reviewer, or the Head, approves or sends back a submitted month (docs/PLAN.md 3.4).
 *
 * Approving counts exactly what was submitted: CO2 comes from the lines frozen on the latest SUBMIT event,
 * which are what the reviewer saw, and is stored with each line's factor (O3, F2).
 */
import type { Prisma, PrismaClient } from "@prisma/client";

import { hasWarnings } from "@/lib/checks";
import { type Co2Line, calculateCo2 } from "@/lib/co2";
import { checkPermission } from "@/lib/permissions";
import { ROLES, hasRole } from "@/lib/roles";
import { type SubmittedLine, checkFlags, submittedLines } from "@/lib/schemas/report";
import type { ReviewQueue } from "@/lib/schemas/review";
import type { SessionUser } from "@/lib/schemas/session";
import type { Db } from "@/server/db";
import { requirePermission } from "@/server/helpers/permissions";
import { companyScope } from "@/server/helpers/scope";
import { loadForChange, permissionPlant, plantRef, plantSelect } from "@/server/services/month";
import { inMonthTransaction, recordTransition } from "@/server/services/transition";

/** Submitted months waiting for review in the user's company: flagged ones first, then the longest waiting. */
export async function listQueue(db: Db, user: SessionUser): Promise<ReviewQueue> {
	if (!hasRole(user, ROLES.REVIEWER, ROLES.SUSTAINABILITY_HEAD)) {
		return [];
	}
	const reports = await db.monthlyReport.findMany({
		where: companyScope(user, { status: "SUBMITTED" as const }),
		select: {
			id: true,
			period: true,
			plant: { select: plantSelect },
			events: {
				where: { action: "SUBMIT" },
				orderBy: { sequence: "desc" },
				take: 1,
				select: { createdAt: true, flags: true, actor: { select: { name: true } } },
			},
		},
	});

	const queue = reports.map((report) => {
		const submission = report.events[0];
		const flags = submission?.flags ? checkFlags.parse(submission.flags) : [];
		const permission = checkPermission(user, permissionPlant(report.plant), "approve");
		return {
			reportId: report.id,
			plant: plantRef(report.plant),
			period: report.period,
			submittedAt: submission?.createdAt ?? new Date(0),
			submittedBy: submission?.actor.name ?? "",
			warningCount: flags.filter((flag) => flag.severity === "warning").length,
			canReview: permission.allowed,
			blockedReason: permission.allowed ? null : permission.message,
		};
	});

	return queue.sort(
		(a, b) =>
			Number(b.warningCount > 0) - Number(a.warningCount > 0) || a.submittedAt.getTime() - b.submittedAt.getTime(),
	);
}

async function latestSubmission(tx: Prisma.TransactionClient, reportId: string) {
	const submission = await tx.reviewEvent.findFirst({
		where: { reportId, action: "SUBMIT" },
		orderBy: { sequence: "desc" },
		select: { lines: true, flags: true },
	});
	if (!submission?.lines) {
		throw new Error(`Month ${reportId} has no frozen submission`);
	}
	return {
		lines: submittedLines.parse(submission.lines),
		flags: submission.flags ? checkFlags.parse(submission.flags) : [],
	};
}

function toCo2Lines(lines: SubmittedLine[]): Record<string, Co2Line> {
	return Object.fromEntries(
		lines.map((line): [string, Co2Line] => {
			if (line.state === "VALUE") {
				return [line.itemKey, { state: "VALUE", value: line.value, unit: line.unit }];
			}
			if (line.state === "NA") {
				return [line.itemKey, { state: "NA", naReason: line.naReason }];
			}
			throw new Error(`${line.itemKey} was submitted without a value`);
		}),
	);
}

/** Approves a submitted month and records what it counted. Flagged months need a comment saying why (U6). */
export async function approveMonth(
	db: PrismaClient,
	user: SessionUser,
	input: { reportId: string; expectedVersion: number; comment: string | null },
) {
	return inMonthTransaction(db, async (tx) => {
		const report = await loadForChange(tx, user, input.reportId);
		const { actingRole } = requirePermission(user, permissionPlant(report.plant), "approve");
		const submission = report.status === "SUBMITTED" ? await latestSubmission(tx, report.id) : null;

		const result = await recordTransition(tx, user, {
			reportId: report.id,
			expectedVersion: input.expectedVersion,
			action: "approve",
			actorRole: actingRole ?? ROLES.REVIEWER,
			comment: input.comment,
			hasFlags: submission ? hasWarnings(submission.flags) : false,
		});

		if (!submission) {
			throw new Error("recordTransition approved a month that was not submitted");
		}
		const co2 = calculateCo2(toCo2Lines(submission.lines));
		await tx.approvalSnapshot.create({
			data: {
				companyId: report.companyId,
				reportId: report.id,
				eventId: result.event.id,
				scope1KgCo2: co2.scope1KgCo2,
				scope2KgCo2: co2.scope2KgCo2,
				lines: co2.lines,
			},
		});
		return { status: result.status, version: result.version };
	});
}

/** Sends a submitted month back to its data owners with a comment saying what needs fixing (O12). */
export async function sendBackMonth(
	db: PrismaClient,
	user: SessionUser,
	input: { reportId: string; expectedVersion: number; comment: string },
) {
	return inMonthTransaction(db, async (tx) => {
		const report = await loadForChange(tx, user, input.reportId);
		const { actingRole } = requirePermission(user, permissionPlant(report.plant), "sendBack");
		const result = await recordTransition(tx, user, {
			reportId: report.id,
			expectedVersion: input.expectedVersion,
			action: "sendBack",
			actorRole: actingRole ?? ROLES.REVIEWER,
			comment: input.comment,
			hasFlags: false,
		});
		return { status: result.status, version: result.version };
	});
}
