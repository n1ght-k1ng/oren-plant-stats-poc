/**
 * Meera's dashboard (Flow 4; docs/PLAN.md 5.1; O6, O7, N2). Approved CO2 only: a month counts when its status
 * is APPROVED now, using its latest approval. Anything else, including a reopened month, contributes nothing,
 * and shows its status instead of a number. Totals are added in kg, exactly, before any rounding (N2).
 */
import { TRPCError } from "@trpc/server";

import { FIRST_REPORTING_PERIOD } from "@/config/reporting";
import { sumDecimals, toDecimalString } from "@/lib/decimal";
import { type FinancialQuarter, currentPeriod, financialQuarter, hasEnded, periodsInQuarter } from "@/lib/periods";
import { ROLES, hasRole } from "@/lib/roles";
import type { Dashboard } from "@/lib/schemas/dashboard";
import type { SessionUser } from "@/lib/schemas/session";
import type { Db } from "@/server/db";
import { companyScope } from "@/server/helpers/scope";

type QuarterKey = { fyStartYear: number; quarter: FinancialQuarter["quarter"] };

function quarterRef({ fyStartYear, quarter }: QuarterKey) {
	return financialQuarter(periodsInQuarter(fyStartYear, quarter)[0]);
}

/** Every quarter from the first reporting month to now, newest first. */
function selectableQuarters(now: Date): QuarterKey[] {
	const quarters: QuarterKey[] = [];
	let cursor = financialQuarter(currentPeriod(now));
	const first = financialQuarter(FIRST_REPORTING_PERIOD);
	while (
		cursor.fyStartYear > first.fyStartYear ||
		(cursor.fyStartYear === first.fyStartYear && cursor.quarter >= first.quarter)
	) {
		quarters.push({ fyStartYear: cursor.fyStartYear, quarter: cursor.quarter });
		cursor =
			cursor.quarter === 1
				? financialQuarter(periodsInQuarter(cursor.fyStartYear - 1, 4)[0])
				: financialQuarter(periodsInQuarter(cursor.fyStartYear, (cursor.quarter - 1) as QuarterKey["quarter"])[0]);
	}
	return quarters;
}

function sumCo2(values: { scope1KgCo2: string; scope2KgCo2: string }[]) {
	if (values.length === 0) {
		return null;
	}
	const scope1 = sumDecimals(values.map((value) => value.scope1KgCo2));
	const scope2 = sumDecimals(values.map((value) => value.scope2KgCo2));
	return { scope1KgCo2: scope1.toFixed(), scope2KgCo2: scope2.toFixed(), totalKgCo2: scope1.plus(scope2).toFixed() };
}

export async function getDashboard(
	db: Db,
	user: SessionUser,
	requested: { fyStartYear: number; quarter: number } | null,
	now: Date,
): Promise<Dashboard> {
	if (!hasRole(user, ROLES.SUSTAINABILITY_HEAD, ROLES.REVIEWER)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "The dashboard is for the Head of Sustainability and reviewers.",
		});
	}

	// Default: the latest quarter with any month in it, else the current one (V2).
	let quarter: QuarterKey;
	if (requested) {
		quarter = { fyStartYear: requested.fyStartYear, quarter: requested.quarter as QuarterKey["quarter"] };
	} else {
		const latest = await db.monthlyReport.findFirst({
			where: companyScope(user),
			orderBy: { period: "desc" },
			select: { period: true },
		});
		const fallback = financialQuarter(currentPeriod(now));
		const chosen = latest ? financialQuarter(latest.period) : fallback;
		quarter = { fyStartYear: chosen.fyStartYear, quarter: chosen.quarter };
	}
	const periods = periodsInQuarter(quarter.fyStartYear, quarter.quarter);
	const due = (period: string) => period >= FIRST_REPORTING_PERIOD && hasEnded(period, now);

	const plants = await db.plant.findMany({
		where: companyScope(user),
		orderBy: { code: "asc" },
		select: {
			id: true,
			code: true,
			name: true,
			type: true,
			monthlyReports: {
				where: { period: { in: periods } },
				select: {
					id: true,
					period: true,
					status: true,
					events: {
						where: { action: "SUBMIT" },
						orderBy: { sequence: "desc" },
						take: 1,
						select: { createdAt: true },
					},
					approvals: {
						orderBy: { createdAt: "desc" },
						take: 1,
						select: { scope1KgCo2: true, scope2KgCo2: true },
					},
				},
			},
		},
	});

	const rows = plants.map((plant) => {
		const cells = periods.map((period) => {
			const report = plant.monthlyReports.find((candidate) => candidate.period === period);
			const snapshot = report?.status === "APPROVED" ? report.approvals[0] : undefined;
			const approved = snapshot
				? sumCo2([
						{ scope1KgCo2: toDecimalString(snapshot.scope1KgCo2), scope2KgCo2: toDecimalString(snapshot.scope2KgCo2) },
					])
				: null;
			return {
				period,
				due: due(period),
				status: report?.status ?? null,
				reportId: report?.id ?? null,
				waitingSince: report?.status === "SUBMITTED" ? (report.events[0]?.createdAt ?? null) : null,
				approved,
			};
		});
		const approvedCells = cells.flatMap((cell) => (cell.approved ? [cell.approved] : []));
		return {
			plant: { id: plant.id, code: plant.code, name: plant.name, type: plant.type },
			cells,
			approved: sumCo2(approvedCells),
			approvedMonths: approvedCells.length,
			dueMonths: cells.filter((cell) => cell.due).length,
		};
	});

	const allApproved = rows.flatMap((row) => row.cells.flatMap((cell) => (cell.approved ? [cell.approved] : [])));
	return {
		quarter: { ...quarterRef(quarter), periods },
		quarters: selectableQuarters(now).map(quarterRef),
		plants: rows,
		company: {
			approved: sumCo2(allApproved),
			approvedMonths: allApproved.length,
			dueMonths: rows.reduce((total, row) => total + row.dueMonths, 0),
			notDue: periods.filter((period) => !due(period)),
			missing: rows.flatMap((row) =>
				row.cells
					.filter((cell) => cell.due && !cell.approved)
					.map((cell) => ({
						plantCode: row.plant.code,
						period: cell.period,
						status: cell.status,
						reportId: cell.reportId,
					})),
			),
		},
	};
}
