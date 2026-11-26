/**
 * Flow 1: a data owner opens a month, enters it, saves and returns, and submits (docs/PLAN.md 3.1, 3.2).
 *
 * Every action loads the month scoped to the user's company, then checks permission (src/lib/permissions.ts),
 * then the status (src/lib/workflow.ts), then the version the user loaded (F4), then writes.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import { ITEMS, type ItemKey, expectationFor, isItemKey, itemByKey } from "@/config/items";
import { FIRST_REPORTING_PERIOD } from "@/config/reporting";
import { type CheckLines, hasWarnings, runChecks } from "@/lib/checks";
import { toCanonical } from "@/lib/conversion";
import { toDecimalString } from "@/lib/decimal";
import { cannotOpenReason, currentPeriod, parsePeriod } from "@/lib/periods";
import { checkPermission } from "@/lib/permissions";
import { parseQuantity } from "@/lib/quantity";
import type { LineInput, MonthDetail, MonthLine, MyMonths } from "@/lib/schemas/month";
import { type CheckFlag, type SubmittedLine, checkFlags, submittedLines } from "@/lib/schemas/report";
import type { SessionUser } from "@/lib/schemas/session";
import { diffSubmissions } from "@/lib/submissionDiff";
import { canEditLines, wasReopened } from "@/lib/workflow";
import type { Db } from "@/server/db";
import { recordChange } from "@/server/helpers/changeLog";
import { requirePermission } from "@/server/helpers/permissions";
import { companyScope } from "@/server/helpers/scope";
import { capacityFor } from "@/server/services/capacity";
import { inMonthTransaction, monthConflict, recordTransition } from "@/server/services/transition";

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "We could not find this month." });

export const plantSelect = {
	id: true,
	code: true,
	name: true,
	type: true,
	companyId: true,
	dataOwners: { select: { id: true } },
} as const;

type PlantWithOwners = Prisma.PlantGetPayload<{ select: typeof plantSelect }>;

export function permissionPlant(plant: PlantWithOwners) {
	return { companyId: plant.companyId, dataOwnerIds: plant.dataOwners.map((owner) => owner.id) };
}

export function plantRef(plant: PlantWithOwners) {
	return { id: plant.id, code: plant.code, name: plant.name, type: plant.type };
}

type StoredLine = Prisma.ReportLineGetPayload<object>;

function toMonthLine(line: StoredLine): MonthLine {
	if (!isItemKey(line.itemKey)) {
		throw new Error(`Unknown item "${line.itemKey}" on month ${line.reportId}`);
	}
	return {
		itemKey: line.itemKey,
		state: line.state,
		value: line.value ? toDecimalString(line.value) : null,
		unit: line.unit,
		enteredValue: line.enteredValue,
		enteredUnit: line.enteredUnit,
		naReason: line.naReason,
		note: line.note,
		source: line.source,
	};
}

function toCheckLines(lines: StoredLine[]): CheckLines {
	const result: CheckLines = {};
	for (const line of lines) {
		if (!isItemKey(line.itemKey)) {
			continue;
		}
		result[line.itemKey] =
			line.state === "VALUE" && line.value
				? { state: "VALUE", value: toDecimalString(line.value) }
				: line.state === "NA"
					? { state: "NA" }
					: { state: "NOT_ENTERED" };
	}
	return result;
}

function toSubmittedLine(line: StoredLine, people: Map<string, string>): SubmittedLine {
	const enteredBy = line.updatedById ? { id: line.updatedById, name: people.get(line.updatedById) ?? "Unknown" } : null;
	const shared = {
		itemKey: line.itemKey,
		enteredValue: line.enteredValue,
		enteredUnit: line.enteredUnit,
		note: line.note,
		source: line.source,
		uploadId: line.uploadId,
		enteredBy,
		enteredAt: enteredBy ? line.updatedAt.toISOString() : null,
	};
	if (line.state === "VALUE" && line.value && line.unit) {
		return { ...shared, state: "VALUE", value: toDecimalString(line.value), unit: line.unit };
	}
	if (line.state === "NA" && line.naReason) {
		return { ...shared, state: "NA", naReason: line.naReason };
	}
	return { ...shared, state: "NOT_ENTERED" };
}

/** The plant's latest approved month before this one, for the month-on-month check (P7). */
async function previousApproved(db: Db, user: SessionUser, plantId: string, period: string) {
	const previous = await db.monthlyReport.findFirst({
		where: companyScope(user, { plantId, status: "APPROVED" as const, period: { lt: period } }),
		orderBy: { period: "desc" },
		select: { period: true, lines: true },
	});
	return previous ? { period: previous.period, lines: toCheckLines(previous.lines) } : null;
}

async function liveFlags(
	db: Db,
	user: SessionUser,
	month: { plantId: string; period: string; plantType: "INTEGRATED" | "GRINDING_UNIT" },
	lines: StoredLine[],
): Promise<{ flags: CheckFlag[]; capacityTpa: number | null; previous: Awaited<ReturnType<typeof previousApproved>> }> {
	const [capacityTpa, previous] = await Promise.all([
		capacityFor(db, user, month.plantId, month.period),
		previousApproved(db, user, month.plantId, month.period),
	]);
	const flags = runChecks({
		plantType: month.plantType,
		period: month.period,
		capacityTpa,
		lines: toCheckLines(lines),
		previous,
	});
	return { flags, capacityTpa, previous };
}

/** Months the data owner can enter, newest first, for each plant they own data for. */
export async function listMyMonths(db: Db, user: SessionUser, now: Date): Promise<MyMonths> {
	const plants = await db.plant.findMany({
		where: companyScope(user, { dataOwners: { some: { id: user.id } } }),
		orderBy: { code: "asc" },
		select: {
			...plantSelect,
			monthlyReports: {
				select: {
					id: true,
					period: true,
					status: true,
					events: {
						where: { action: { in: ["SEND_BACK" as const, "REOPEN" as const] } },
						orderBy: { sequence: "desc" as const },
						take: 1,
						select: { action: true },
					},
				},
			},
		},
	});

	// Every ended month from the first reporting month, newest first.
	const periods: string[] = [];
	const { year, month } = parsePeriod(currentPeriod(now));
	for (let cursor = new Date(Date.UTC(year, month - 2, 1)); ; cursor.setUTCMonth(cursor.getUTCMonth() - 1)) {
		const period = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
		if (period < FIRST_REPORTING_PERIOD) {
			break;
		}
		periods.push(period);
	}

	return plants.map((plant) => {
		const byPeriod = new Map(plant.monthlyReports.map((report) => [report.period, report]));
		return {
			plant: plantRef(plant),
			months: periods.map((period) => {
				const report = byPeriod.get(period);
				return {
					period,
					status: report?.status ?? null,
					reportId: report?.id ?? null,
					reopened: report ? wasReopened(report.status, report.events[0]?.action) : false,
				};
			}),
		};
	});
}

/** Opens a plant's month, creating it with one line per item, or returns it if it already exists. */
export async function openMonth(
	db: PrismaClient,
	user: SessionUser,
	input: { plantId: string; period: string },
	now: Date,
): Promise<{ reportId: string }> {
	const plant = await db.plant.findFirst({ where: companyScope(user, { id: input.plantId }), select: plantSelect });
	if (!plant) {
		throw new TRPCError({ code: "NOT_FOUND", message: "We could not find this plant." });
	}
	requirePermission(user, permissionPlant(plant), "open");
	const reason = cannotOpenReason(input.period, now);
	if (reason) {
		throw new TRPCError({ code: "BAD_REQUEST", message: reason });
	}

	const existing = await db.monthlyReport.findUnique({
		where: { plantId_period: { plantId: plant.id, period: input.period } },
		select: { id: true },
	});
	if (existing) {
		return { reportId: existing.id };
	}

	try {
		const report = await db.monthlyReport.create({
			data: {
				companyId: user.companyId,
				plantId: plant.id,
				period: input.period,
				plantType: plant.type,
				openedById: user.id,
				lines: {
					create: ITEMS.map((item) => {
						const fixedNa = expectationFor(item.key, plant.type) === "FIXED_NA";
						return {
							companyId: user.companyId,
							itemKey: item.key,
							state: fixedNa ? ("NA" as const) : ("NOT_ENTERED" as const),
							naReason: fixedNa ? ("NOT_APPLICABLE" as const) : null,
						};
					}),
				},
			},
			select: { id: true },
		});
		return { reportId: report.id };
	} catch (error) {
		// Another owner of the plant opened the same month at the same moment: use theirs.
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
			const report = await db.monthlyReport.findUniqueOrThrow({
				where: { plantId_period: { plantId: plant.id, period: input.period } },
				select: { id: true },
			});
			return { reportId: report.id };
		}
		throw error;
	}
}

const monthInclude = {
	plant: { select: plantSelect },
	lines: true,
	events: {
		orderBy: { sequence: "asc" as const },
		include: { actor: { select: { name: true } } },
	},
} as const;

/** A month as this user may see it (R1): values hidden from non-owners until it is submitted. */
export async function getMonth(db: Db, user: SessionUser, reportId: string): Promise<MonthDetail> {
	const report = await db.monthlyReport.findFirst({
		where: companyScope(user, { id: reportId }),
		include: monthInclude,
	});
	if (!report) {
		throw notFound();
	}
	const plant = permissionPlant(report.plant);
	requirePermission(user, plant, "viewStatus");
	const values = checkPermission(user, plant, "viewValues", { status: report.status });
	const canEdit = checkPermission(user, plant, "edit").allowed && canEditLines(report.status);
	const reviewPermission = checkPermission(user, plant, "approve");
	const review =
		report.status !== "SUBMITTED"
			? { canReview: false, blockedReason: null }
			: reviewPermission.allowed
				? { canReview: true, blockedReason: null }
				: {
						canReview: false,
						// Only explain to people who review; a data owner simply waits.
						blockedReason: reviewPermission.reason === "OWN_PLANT" ? reviewPermission.message : null,
					};

	const lines = ITEMS.flatMap((item) => report.lines.filter((line) => line.itemKey === item.key));
	const live = await liveFlags(db, user, report, lines);
	const lastSubmit = [...report.events].reverse().find((event) => event.action === "SUBMIT");
	const frozenFlags = lastSubmit?.flags ? checkFlags.parse(lastSubmit.flags) : [];
	const lastReturn = [...report.events]
		.reverse()
		.find((event) => event.action === "SEND_BACK" || event.action === "REOPEN");

	return {
		id: report.id,
		plant: plantRef(report.plant),
		period: report.period,
		status: report.status,
		reopened: wasReopened(report.status, lastReturn?.action),
		version: report.version,
		plantType: report.plantType,
		canEdit,
		lines: values.allowed ? lines.map(toMonthLine) : null,
		hiddenReason: values.allowed ? null : values.message,
		checkContext: values.allowed
			? { capacityTpa: live.capacityTpa, previous: live.previous }
			: { capacityTpa: null, previous: null },
		flags: !values.allowed ? [] : canEditLines(report.status) ? live.flags : frozenFlags,
		returnComment:
			report.status === "RETURNED" && lastReturn?.comment
				? {
						action: lastReturn.action === "REOPEN" ? ("REOPEN" as const) : ("SEND_BACK" as const),
						text: lastReturn.comment,
						by: lastReturn.actor.name,
						at: lastReturn.createdAt,
					}
				: null,
		review,
		canReopen: report.status === "APPROVED" && checkPermission(user, plant, "reopen").allowed,
		history: report.events.map((event) => {
			// A resubmission lists what changed since the submission before it.
			const earlier = report.events.filter(
				(candidate) => candidate.action === "SUBMIT" && candidate.sequence < event.sequence,
			);
			const previousSubmit = earlier.at(-1);
			const changes =
				event.action === "SUBMIT" && previousSubmit?.lines && event.lines
					? diffSubmissions(submittedLines.parse(previousSubmit.lines), submittedLines.parse(event.lines))
					: [];
			return {
				sequence: event.sequence,
				action: event.action,
				toStatus: event.toStatus,
				actorName: event.actor.name,
				actorRole: event.actorRole,
				comment: event.comment,
				createdAt: event.createdAt,
				changes,
			};
		}),
	};
}

type LineUpdate = {
	state: "VALUE" | "NA" | "NOT_ENTERED";
	value: string | null;
	unit: string | null;
	enteredValue: string | null;
	enteredUnit: string | null;
	naReason: "NOT_APPLICABLE" | "NOT_USED_THIS_MONTH" | null;
	note: string | null;
};

/** Reads one line from the form. Validation errors block saving (P3); plausibility never does (D7). */
function readLine(input: LineInput, plantType: "INTEGRATED" | "GRINDING_UNIT"): LineUpdate | string {
	const item = itemByKey(input.itemKey as ItemKey);
	const note = input.note?.trim() || null;
	if (expectationFor(item.key, plantType) === "FIXED_NA") {
		return `${item.label} is always N/A at this plant.`;
	}
	const empty = { value: null, unit: null, enteredValue: null, enteredUnit: null, naReason: null, note };
	if (input.mode === "na") {
		return { ...empty, state: "NA", naReason: "NOT_APPLICABLE" };
	}
	const parsed = parseQuantity(input.value);
	if (input.mode === "blank" || parsed.kind === "blank") {
		return { ...empty, state: "NOT_ENTERED" };
	}
	if (parsed.kind === "na") {
		return { ...empty, state: "NA", naReason: "NOT_APPLICABLE" };
	}
	if (parsed.kind === "invalid") {
		return `${item.label}: ${parsed.message}`;
	}
	if (!(item.formUnits as readonly string[]).includes(input.unit)) {
		return `${item.label}: choose ${item.formUnits.join(" or ")}.`;
	}
	const canonical = toCanonical(item.key, parsed.value, input.unit);
	if (!canonical.ok) {
		return `${item.label}: ${canonical.message}`;
	}
	return {
		state: "VALUE",
		value: canonical.value,
		unit: canonical.unit,
		enteredValue: input.value.trim(),
		enteredUnit: input.unit,
		naReason: null,
		note,
	};
}

/** How a line reads in the change log. */
function describe(line: Pick<LineUpdate, "state" | "enteredValue" | "enteredUnit" | "value" | "unit" | "naReason">) {
	if (line.state === "VALUE") {
		return `${line.enteredValue ?? line.value} ${line.enteredUnit ?? line.unit}`;
	}
	if (line.state === "NA") {
		return line.naReason === "NOT_USED_THIS_MONTH" ? "not used this month" : "N/A";
	}
	return "not entered";
}

export async function loadForChange(tx: Prisma.TransactionClient, user: SessionUser, reportId: string) {
	const report = await tx.monthlyReport.findFirst({
		where: companyScope(user, { id: reportId }),
		include: { plant: { select: plantSelect }, lines: true },
	});
	if (!report) {
		throw notFound();
	}
	return report;
}

function requireEditable(status: Parameters<typeof canEditLines>[0]) {
	if (!canEditLines(status)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "This month has been submitted, so it can't be changed. A reviewer can send it back if needed.",
		});
	}
}

/** Saves a draft (Flow 1: save and return later). Returns the new version. */
export async function saveLines(
	db: PrismaClient,
	user: SessionUser,
	input: { reportId: string; expectedVersion: number; lines: LineInput[] },
) {
	return inMonthTransaction(db, async (tx) => {
		const report = await loadForChange(tx, user, input.reportId);
		requirePermission(user, permissionPlant(report.plant), "edit");
		requireEditable(report.status);
		if (report.version !== input.expectedVersion) {
			throw monthConflict();
		}

		const uploadIds = [...new Set(input.lines.flatMap((line) => (line.uploadId ? [line.uploadId] : [])))];
		if (uploadIds.length > 0) {
			const found = await tx.upload.count({
				where: companyScope(user, { id: { in: uploadIds }, reportId: report.id }),
			});
			if (found !== uploadIds.length) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "That import belongs to a different month. Import the file again here.",
				});
			}
		}

		const updates = input.lines.map((line) => ({ line, update: readLine(line, report.plantType) }));
		const errors = updates.flatMap(({ update }) => (typeof update === "string" ? [update] : []));
		if (errors.length > 0) {
			throw new TRPCError({ code: "BAD_REQUEST", message: errors.join(" ") });
		}

		const changes: Record<string, { from: string | null; to: string | null }> = {};
		for (const { line, update } of updates) {
			if (typeof update === "string") {
				continue;
			}
			const stored = report.lines.find((candidate) => candidate.itemKey === line.itemKey);
			if (!stored) {
				throw new Error(`Month ${report.id} has no line for ${line.itemKey}`);
			}
			const label = itemByKey(line.itemKey as ItemKey).label;
			const before = describe({ ...stored, value: stored.value ? toDecimalString(stored.value) : null });
			const after = describe(update);
			if (before !== after) {
				changes[label] = { from: before, to: line.uploadId ? `${after} (imported)` : after };
			}
			if ((stored.note ?? null) !== update.note) {
				changes[`${label} note`] = { from: stored.note, to: update.note };
			}
			const source = line.uploadId ? ("IMPORT" as const) : ("FORM" as const);
			if (before !== after || (stored.note ?? null) !== update.note || stored.uploadId !== (line.uploadId ?? null)) {
				await tx.reportLine.update({
					where: { id: stored.id },
					data: { ...update, source, uploadId: line.uploadId ?? null, updatedById: user.id },
				});
				if (line.uploadId && before === after) {
					changes[`${label} source`] = { from: "typed", to: "imported" };
				}
			}
		}

		if (Object.keys(changes).length === 0) {
			return { status: report.status, version: report.version };
		}
		const bumped = await tx.monthlyReport.updateMany({
			where: { id: report.id, version: input.expectedVersion },
			data: { version: { increment: 1 } },
		});
		if (bumped.count === 0) {
			throw monthConflict();
		}
		await recordChange(tx, user, { entityType: "monthlyReport", entityId: report.id, action: "save", changes });
		return { status: report.status, version: input.expectedVersion + 1 };
	});
}

/**
 * Submits a month (Flow 1). Every expected item must be a value or N/A, and every blank optional item must be
 * confirmed as "Not used this month" (P4). Freezes the lines and flags on the event (F1, U2).
 */
export async function submitMonth(
	db: PrismaClient,
	user: SessionUser,
	input: { reportId: string; expectedVersion: number; confirmNotUsed: string[] },
) {
	return inMonthTransaction(db, async (tx) => {
		const report = await loadForChange(tx, user, input.reportId);
		const { actingRole } = requirePermission(user, permissionPlant(report.plant), "submit");
		requireEditable(report.status);
		if (report.version !== input.expectedVersion) {
			throw monthConflict();
		}

		const missing: string[] = [];
		const unconfirmed: string[] = [];
		const toConfirm: StoredLine[] = [];
		for (const item of ITEMS) {
			const line = report.lines.find((candidate) => candidate.itemKey === item.key);
			if (!line || line.state !== "NOT_ENTERED") {
				continue;
			}
			const expectation = expectationFor(item.key, report.plantType);
			if (expectation === "OPTIONAL" && input.confirmNotUsed.includes(item.key)) {
				toConfirm.push(line);
			} else if (expectation === "OPTIONAL") {
				unconfirmed.push(item.label);
			} else {
				missing.push(item.label);
			}
		}
		if (missing.length > 0) {
			throw new TRPCError({ code: "BAD_REQUEST", message: `Enter a value or N/A for: ${missing.join(", ")}.` });
		}
		if (unconfirmed.length > 0) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Confirm that these were not used this month: ${unconfirmed.join(", ")}.`,
			});
		}

		if (toConfirm.length > 0) {
			await tx.reportLine.updateMany({
				where: { id: { in: toConfirm.map((line) => line.id) } },
				data: { state: "NA", naReason: "NOT_USED_THIS_MONTH", updatedById: user.id },
			});
			await recordChange(tx, user, {
				entityType: "monthlyReport",
				entityId: report.id,
				action: "confirmNotUsed",
				changes: Object.fromEntries(
					toConfirm.map((line) => [
						itemByKey(line.itemKey as ItemKey).label,
						{ from: "not entered", to: "not used this month" },
					]),
				),
			});
		}

		const lines = ITEMS.flatMap((item) => {
			const line = report.lines.find((candidate) => candidate.itemKey === item.key);
			if (!line) {
				return [];
			}
			return toConfirm.includes(line)
				? [
						{
							...line,
							state: "NA" as const,
							naReason: "NOT_USED_THIS_MONTH" as const,
							updatedById: user.id,
							updatedAt: new Date(),
						},
					]
				: [line];
		});
		const editorIds = [...new Set(lines.flatMap((line) => (line.updatedById ? [line.updatedById] : [])))];
		const editors = await tx.user.findMany({
			where: companyScope(user, { id: { in: editorIds } }),
			select: { id: true, name: true },
		});
		const people = new Map(editors.map((editor) => [editor.id, editor.name]));
		const { flags } = await liveFlags(tx, user, report, lines);

		const result = await recordTransition(tx, user, {
			reportId: report.id,
			expectedVersion: input.expectedVersion,
			action: "submit",
			actorRole: actingRole ?? "DATA_OWNER",
			hasFlags: hasWarnings(flags),
			frozen: { lines: lines.map((line) => toSubmittedLine(line, people)), flags },
		});
		return { status: result.status, version: result.version };
	});
}
