import { Prisma, type PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import type { Role } from "@/lib/roles";
import { type CheckFlag, type SubmittedLine, checkFlags, submittedLines } from "@/lib/schemas/report";
import type { SessionUser } from "@/lib/schemas/session";
import { REVIEW_ACTION, type WorkflowAction, transition } from "@/lib/workflow";
import { companyScope } from "@/server/helpers/scope";

/** Shown when someone else changed the month between loading it and acting on it. */
export const MONTH_CONFLICT_MESSAGE = "Someone else just updated this month. Please reload to see their changes.";

export function monthConflict(): TRPCError {
	return new TRPCError({ code: "CONFLICT", message: MONTH_CONFLICT_MESSAGE });
}

/** True for the unique-constraint error raised when two events claim the same place in a month's history (F4). */
function isSequenceClash(error: unknown): boolean {
	if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
		return false;
	}
	const target = error.meta?.target;
	const fields = Array.isArray(target) ? target : [String(target ?? "")];
	return fields.some((field) => String(field).includes("sequence"));
}

/**
 * Runs a change to a month in one transaction. If another change got there first, the user gets a
 * CONFLICT (HTTP 409) asking them to reload, not a server error.
 */
export async function inMonthTransaction<T>(
	db: PrismaClient,
	work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
	try {
		return await db.$transaction(work);
	} catch (error) {
		if (isSequenceClash(error)) {
			throw monthConflict();
		}
		throw error;
	}
}

export type TransitionRequest = {
	reportId: string;
	/** The month's version when the user loaded it. A different current version means someone else changed it. */
	expectedVersion: number;
	action: WorkflowAction;
	/** The role the user acts in, as decided by the permission rules (O5). */
	actorRole: Role;
	comment?: string | null;
	hasFlags: boolean;
	/** On submit: every line as submitted, and the flags at that moment (F1, U2). */
	frozen?: { lines: SubmittedLine[]; flags: CheckFlag[] };
};

/**
 * Moves a month to its next status and records the event, inside the caller's transaction (use
 * inMonthTransaction). Checks the status rules, not permissions: the caller checks those first.
 */
export async function recordTransition(tx: Prisma.TransactionClient, user: SessionUser, request: TransitionRequest) {
	const report = await tx.monthlyReport.findFirst({
		where: companyScope(user, { id: request.reportId }),
		select: { id: true, companyId: true, status: true, version: true },
	});
	if (!report) {
		throw new TRPCError({ code: "NOT_FOUND", message: "We could not find this month." });
	}
	if (report.version !== request.expectedVersion) {
		throw monthConflict();
	}

	const result = transition({
		status: report.status,
		action: request.action,
		comment: request.comment,
		hasFlags: request.hasFlags,
	});
	if (!result.ok) {
		throw new TRPCError({ code: "BAD_REQUEST", message: result.message });
	}

	if (request.action === "submit" && !request.frozen) {
		throw new Error("A submission must freeze its lines and flags (F1, U2).");
	}
	const frozen = request.frozen && {
		lines: submittedLines.parse(request.frozen.lines),
		flags: checkFlags.parse(request.frozen.flags),
	};

	// Only succeeds if nobody changed the month since it was read; the row lock makes a second caller wait,
	// then find the new version and stop.
	const updated = await tx.monthlyReport.updateMany({
		where: { id: report.id, version: request.expectedVersion },
		data: { status: result.to, version: { increment: 1 } },
	});
	if (updated.count === 0) {
		throw monthConflict();
	}

	const last = await tx.reviewEvent.aggregate({ where: { reportId: report.id }, _max: { sequence: true } });
	const event = await tx.reviewEvent.create({
		data: {
			companyId: report.companyId,
			reportId: report.id,
			sequence: (last._max.sequence ?? 0) + 1,
			action: REVIEW_ACTION[request.action],
			fromStatus: report.status,
			toStatus: result.to,
			actorId: user.id,
			actorRole: request.actorRole,
			comment: request.comment?.trim() || null,
			...(frozen ? { lines: frozen.lines, flags: frozen.flags } : {}),
		},
	});

	return { status: result.to, version: request.expectedVersion + 1, event };
}
