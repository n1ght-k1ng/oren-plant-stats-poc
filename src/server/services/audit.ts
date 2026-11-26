/**
 * A month's audit trail (docs/PLAN.md 3.8, H1). Answers "how did this figure come to be?": each approved line
 * traced back to what was typed and who typed it, then every edit, submission, flag set and review in order.
 *
 * Everything shown is read from what was frozen or logged at the time (F1, F2, D15), never recalculated.
 */
import { TRPCError } from "@trpc/server";

import { ITEMS } from "@/config/items";
import { sumDecimals, toDecimalString } from "@/lib/decimal";
import { checkPermission } from "@/lib/permissions";
import type { MonthAudit, TimelineEntry, TracedLine } from "@/lib/schemas/audit";
import { type SubmittedLine, approvalLines, checkFlags, submittedLines } from "@/lib/schemas/report";
import type { SessionUser } from "@/lib/schemas/session";
import { diffSubmissions } from "@/lib/submissionDiff";
import type { Db } from "@/server/db";
import { requirePermission } from "@/server/helpers/permissions";
import { companyScope } from "@/server/helpers/scope";
import { permissionPlant, plantRef, plantSelect } from "@/server/services/month";

const ROLE_FOR_EDITS = "DATA_OWNER";

function traceLines(approved: ReturnType<typeof approvalLines.parse>, submitted: SubmittedLine[]): TracedLine[] {
	return ITEMS.flatMap((item): TracedLine[] => {
		const line = approved.find((candidate) => candidate.itemKey === item.key);
		if (!line) {
			return [];
		}
		const typed = submitted.find((candidate) => candidate.itemKey === item.key);
		const shared = {
			itemKey: item.key,
			label: item.label,
			typedValue: typed?.enteredValue ?? null,
			typedUnit: typed?.enteredUnit ?? null,
			note: typed?.note ?? null,
			source: typed?.source ?? null,
			enteredBy: typed?.enteredBy?.name ?? null,
			enteredAt: typed?.enteredAt ? new Date(typed.enteredAt) : null,
		};
		if (line.state === "NA") {
			return [
				{
					...shared,
					state: "NA",
					value: null,
					unit: null,
					naReason: line.naReason,
					kgCo2PerUnit: null,
					factorSource: null,
					factorYear: null,
					scope: null,
					kgCo2: null,
				},
			];
		}
		return [
			{
				...shared,
				state: "VALUE",
				value: line.value,
				unit: line.unit,
				naReason: null,
				kgCo2PerUnit: line.kgCo2PerUnit,
				factorSource: line.factorSource,
				factorYear: line.factorYear,
				scope: line.scope,
				kgCo2: line.kgCo2,
			},
		];
	});
}

export async function getAudit(db: Db, user: SessionUser, reportId: string): Promise<MonthAudit> {
	const report = await db.monthlyReport.findFirst({
		where: companyScope(user, { id: reportId }),
		include: {
			plant: { select: plantSelect },
			events: { orderBy: { sequence: "asc" }, include: { actor: { select: { name: true } } } },
			approvals: { orderBy: { createdAt: "desc" } },
		},
	});
	if (!report) {
		throw new TRPCError({ code: "NOT_FOUND", message: "We could not find this month." });
	}
	const plant = permissionPlant(report.plant);
	requirePermission(user, plant, "viewHistory");
	// R1: edits made while a month is a draft or being fixed are values, so only its data owners see them then.
	const editsVisible = checkPermission(user, plant, "viewValues", { status: report.status }).allowed;

	const edits = editsVisible
		? await db.changeLog.findMany({
				where: companyScope(user, { entityType: "monthlyReport", entityId: report.id }),
				orderBy: { createdAt: "asc" },
				include: { changedBy: { select: { name: true } } },
			})
		: [];

	const submissions = report.events.filter((event) => event.action === "SUBMIT");
	const frozenLines = (event: (typeof report.events)[number] | undefined) =>
		event?.lines ? submittedLines.parse(event.lines) : [];

	const approvals = report.approvals.map((snapshot) => {
		const event = report.events.find((candidate) => candidate.id === snapshot.eventId);
		if (!event) {
			throw new Error(`Approval ${snapshot.id} has no event`);
		}
		const submission = submissions.filter((candidate) => candidate.sequence < event.sequence).at(-1);
		const scope1 = toDecimalString(snapshot.scope1KgCo2);
		const scope2 = toDecimalString(snapshot.scope2KgCo2);
		return {
			approvedBy: { name: event.actor.name, role: event.actorRole },
			approvedAt: event.createdAt,
			comment: event.comment,
			scope1KgCo2: scope1,
			scope2KgCo2: scope2,
			totalKgCo2: sumDecimals([scope1, scope2]).toFixed(),
			submittedBy: submission?.actor.name ?? null,
			submittedAt: submission?.createdAt ?? null,
			lines: traceLines(approvalLines.parse(snapshot.lines), frozenLines(submission)),
		};
	});
	const current = report.status === "APPROVED" ? (approvals[0] ?? null) : null;
	const earlier = (current ? approvals.slice(1) : approvals).map(({ lines: _lines, ...rest }) => rest);

	const eventEntries = report.events.map((event): TimelineEntry & { order: number } => {
		const previousSubmission = submissions.filter((candidate) => candidate.sequence < event.sequence).at(-1);
		const snapshot = report.approvals.find((candidate) => candidate.eventId === event.id);
		return {
			kind: event.action,
			at: event.createdAt,
			actor: { name: event.actor.name, role: event.actorRole },
			comment: event.comment,
			changes:
				event.action === "SUBMIT" && previousSubmission
					? diffSubmissions(frozenLines(previousSubmission), frozenLines(event))
					: [],
			flags: event.action === "SUBMIT" && event.flags ? checkFlags.parse(event.flags) : null,
			totals: snapshot
				? { scope1KgCo2: toDecimalString(snapshot.scope1KgCo2), scope2KgCo2: toDecimalString(snapshot.scope2KgCo2) }
				: null,
			// Within one transaction an edit and its event share a timestamp; the edit came first.
			order: 1,
		};
	});
	const editEntries = edits.map((entry): TimelineEntry & { order: number } => ({
		kind: entry.action === "confirmNotUsed" ? "CONFIRM_NOT_USED" : "EDIT",
		at: entry.createdAt,
		actor: { name: entry.changedBy.name, role: ROLE_FOR_EDITS },
		comment: null,
		changes: Object.entries(entry.changes as Record<string, { from: string | null; to: string | null }>).map(
			([label, change]) => ({ label, from: change.from, to: change.to }),
		),
		flags: null,
		totals: null,
		order: 0,
	}));
	const timeline = [...editEntries, ...eventEntries]
		.sort((a, b) => a.at.getTime() - b.at.getTime() || a.order - b.order)
		.map(({ order: _order, ...entry }) => entry);

	return {
		id: report.id,
		plant: plantRef(report.plant),
		period: report.period,
		status: report.status,
		approval: current,
		earlierApprovals: earlier,
		timeline,
		draftEditsHidden: !editsVisible,
	};
}
