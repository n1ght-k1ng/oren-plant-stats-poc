import { AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/months/StatusBadge";
import { OrenButton } from "@/components/ui/OrenButton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	EmptyState,
	EmptyStateActions,
	EmptyStateDescription,
	EmptyStateIcon,
	EmptyStateTitle,
} from "@/components/ui/empty-state";
import { PageHeader, PageHeaderDescription, PageHeaderHeading, PageHeaderRow } from "@/components/ui/page-header";
import { OrenSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTonnes } from "@/lib/co2";
import { periodLabel } from "@/lib/periods";
import type { Dashboard, DashboardCell } from "@/lib/schemas/dashboard";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

const DAY = 24 * 60 * 60 * 1000;

function waited(since: Date): string {
	const days = Math.floor((Date.now() - since.getTime()) / DAY);
	return days < 1 ? "Waiting under a day" : `Waiting ${days} ${days === 1 ? "day" : "days"}`;
}

function shortMonth(period: string): string {
	return periodLabel(period).replace(/^(\w{3})\w*/, "$1");
}

function Tonnes({ kg, className }: { kg: string; className?: string }) {
	return <span className={cn("tabular-nums", className)}>{formatTonnes(kg)} t</span>;
}

/** One plant-month. An approved figure links to its audit trail; anything else shows its status and no number. */
function Cell({ cell, code }: { cell: DashboardCell; code: string }) {
	const testId = `dashboard-cell-${code}-${cell.period}`;
	if (!cell.due) {
		return (
			<span className="text-xs text-text-secondary" data-testid={testId}>
				Not due yet
			</span>
		);
	}
	if (cell.approved && cell.reportId) {
		return (
			<Link
				href={`/months/${cell.reportId}/audit`}
				className="group flex flex-col rounded-md px-2 py-1 text-sm hover:bg-surface-hover"
				data-testid={testId}
			>
				<span className="text-text-primary group-hover:underline">
					<span className="text-xs text-text-secondary">S1 </span>
					<Tonnes kg={cell.approved.scope1KgCo2} />
				</span>
				<span className="text-text-primary group-hover:underline">
					<span className="text-xs text-text-secondary">S2 </span>
					<Tonnes kg={cell.approved.scope2KgCo2} />
				</span>
			</Link>
		);
	}
	if (!cell.status || !cell.reportId) {
		return (
			<span className="text-sm text-text-secondary" data-testid={testId}>
				Not started
			</span>
		);
	}
	return (
		<Link href={`/months/${cell.reportId}`} className="flex flex-col items-start gap-1" data-testid={testId}>
			<StatusBadge status={cell.status} reopened={cell.reopened} />
			{cell.waitingSince && <span className="text-xs text-text-secondary">{waited(cell.waitingSince)}</span>}
		</Link>
	);
}

const MISSING_GROUPS = [
	{ status: "SUBMITTED", label: "Waiting for review" },
	{ status: "REOPENED", label: "Reopened by the Head" },
	{ status: "RETURNED", label: "Sent back to the plant" },
	{ status: "DRAFT", label: "Being entered" },
	{ status: null, label: "Not started" },
] as const;

function Missing({ data }: { data: Dashboard }) {
	const groups = MISSING_GROUPS.map((group) => ({
		...group,
		months: data.company.missing.filter(
			(entry) => (entry.status === "RETURNED" && entry.reopened ? "REOPENED" : entry.status) === group.status,
		),
	})).filter((group) => group.months.length > 0);
	if (groups.length === 0) {
		return null;
	}
	return (
		<dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2" data-testid="dashboard-missing">
			{groups.map((group) => (
				<div key={group.label} className="flex flex-col gap-1">
					<dt className="font-medium text-text-primary">
						{group.label} ({group.months.length})
					</dt>
					<dd className="flex flex-wrap gap-x-3 gap-y-1 text-text-secondary">
						{group.months.map((entry) =>
							entry.reportId ? (
								<Link
									key={`${entry.plantCode}-${entry.period}`}
									href={`/months/${entry.reportId}`}
									className="text-text-link hover:text-text-link-hover hover:underline"
								>
									{entry.plantCode} {shortMonth(entry.period)}
								</Link>
							) : (
								<span key={`${entry.plantCode}-${entry.period}`}>
									{entry.plantCode} {shortMonth(entry.period)}
								</span>
							),
						)}
					</dd>
				</div>
			))}
		</dl>
	);
}

function Readiness({ data }: { data: Dashboard }) {
	const { approvedMonths, dueMonths, notDue } = data.company;
	const ready = dueMonths > 0 && approvedMonths === dueMonths;
	const notDueText =
		notDue.length > 0
			? ` ${notDue.map((period) => periodLabel(period)).join(" and ")} ${notDue.length === 1 ? "has" : "have"} not ended yet.`
			: "";
	return (
		<div
			className={cn(
				"flex items-start gap-3 rounded-lg px-4 py-3",
				ready ? "bg-feedback-success-bg/40" : "bg-surface-warning-subtle",
			)}
			data-testid="dashboard-readiness"
		>
			{ready ? (
				<CheckCircle2 className="mt-0.5 size-5 shrink-0 text-feedback-success-fg" aria-hidden />
			) : (
				<AlertTriangle className="mt-0.5 size-5 shrink-0 text-feedback-warning-fg" aria-hidden />
			)}
			<div className="flex flex-col gap-0.5 text-sm text-text-primary">
				<span className="font-semibold">
					{ready
						? `Ready for the board: all ${dueMonths} plant-months of ${data.quarter.label} are approved.`
						: `Not ready for the board. ${data.quarter.label}: ${approvedMonths} of ${dueMonths} plant-months approved.`}
				</span>
				<span className="text-text-secondary">
					{ready
						? "Every figure below has been approved."
						: "The totals below include approved months only, so they are partial."}
					{notDueText}
				</span>
			</div>
		</div>
	);
}

function CompanyFigure({
	label,
	kg,
	partial,
	testId,
}: { label: string; kg: string | null; partial: boolean; testId: string }) {
	return (
		<div className="flex flex-col gap-1">
			<span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
				{label}
				{partial && kg && <Badge tone="warning">Partial</Badge>}
			</span>
			<span className="text-2xl font-semibold tabular-nums text-text-primary" data-testid={testId}>
				{kg ? `${formatTonnes(kg)} t CO2` : "No approved months"}
			</span>
		</div>
	);
}

/** Flow 4: where every plant and month stands, and the approved CO2 Meera can take to the board. */
export default function DashboardPage() {
	const [chosen, setChosen] = useState<{ fyStartYear: number; quarter: number } | null>(null);
	const overview = api.dashboard.overview.useQuery(chosen, { keepPreviousData: true });

	if (overview.isError) {
		return (
			<AppLayout title="Dashboard">
				<EmptyState>
					<EmptyStateIcon icon={AlertTriangle} />
					<EmptyStateTitle>We could not load the dashboard</EmptyStateTitle>
					<EmptyStateDescription>{overview.error.message}</EmptyStateDescription>
					<EmptyStateActions>
						<OrenButton onClick={() => void overview.refetch()} data-testid="dashboard-retry">
							Try Again
						</OrenButton>
					</EmptyStateActions>
				</EmptyState>
			</AppLayout>
		);
	}
	if (!overview.data) {
		return (
			<AppLayout title="Dashboard">
				<div className="flex flex-col gap-3" aria-busy>
					<Skeleton className="h-8 w-72" />
					<Skeleton className="h-16 w-full" />
					<Skeleton className="h-96 w-full" />
				</div>
			</AppLayout>
		);
	}

	const data = overview.data;
	const partial = data.company.approvedMonths < data.company.dueMonths;
	const quarterValue = `${data.quarter.fyStartYear}-${data.quarter.quarter}`;

	return (
		<AppLayout title="Dashboard">
			<PageHeader bordered>
				<PageHeaderRow>
					<div className="flex flex-col gap-1">
						<PageHeaderHeading>Company CO2</PageHeaderHeading>
						<PageHeaderDescription>Approved figures by plant, and where every month stands.</PageHeaderDescription>
					</div>
					<div className="w-48">
						<OrenSelect
							aria-label="Quarter"
							options={data.quarters.map((quarter) => ({
								label: quarter.label,
								value: `${quarter.fyStartYear}-${quarter.quarter}`,
							}))}
							value={quarterValue}
							onValueChange={(value) => {
								const [fyStartYear, quarter] = value.split("-").map(Number);
								setChosen({ fyStartYear, quarter });
							}}
							data-testid="dashboard-quarter"
						/>
					</div>
				</PageHeaderRow>
			</PageHeader>

			<div className="flex flex-col gap-6">
				<Readiness data={data} />

				<Card>
					<CardHeader>
						<CardTitle>{data.quarter.label}: approved CO2</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-5">
						<div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
							<CompanyFigure
								label="Scope 1"
								kg={data.company.approved?.scope1KgCo2 ?? null}
								partial={partial}
								testId="dashboard-scope1"
							/>
							<CompanyFigure
								label="Scope 2"
								kg={data.company.approved?.scope2KgCo2 ?? null}
								partial={partial}
								testId="dashboard-scope2"
							/>
							<CompanyFigure
								label="Total"
								kg={data.company.approved?.totalKgCo2 ?? null}
								partial={partial}
								testId="dashboard-total"
							/>
						</div>
						<Missing data={data} />
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>By plant and month</CardTitle>
					</CardHeader>
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Plant</TableHead>
									{data.quarter.periods.map((period) => (
										<TableHead key={period}>{periodLabel(period)}</TableHead>
									))}
									<TableHead>Quarter, approved</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.plants.map((row) => (
									<TableRow key={row.plant.id} data-testid={`dashboard-row-${row.plant.code}`}>
										<TableCell className="font-medium">
											{row.plant.code} {row.plant.name}
										</TableCell>
										{row.cells.map((cell) => (
											<TableCell key={cell.period} className="align-top">
												<Cell cell={cell} code={row.plant.code} />
											</TableCell>
										))}
										<TableCell className="align-top text-sm" data-testid={`dashboard-plant-total-${row.plant.code}`}>
											{row.approved ? (
												<span className="flex flex-col">
													<span>
														<span className="text-xs text-text-secondary">S1 </span>
														<Tonnes kg={row.approved.scope1KgCo2} />
													</span>
													<span>
														<span className="text-xs text-text-secondary">S2 </span>
														<Tonnes kg={row.approved.scope2KgCo2} />
													</span>
													{row.approvedMonths < row.dueMonths && (
														<span className="text-xs text-text-secondary">
															{row.approvedMonths} of {row.dueMonths} months
														</span>
													)}
												</span>
											) : (
												<span className="text-text-secondary">None approved</span>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</Card>

				<p className="text-xs text-text-secondary" data-testid="dashboard-footnote">
					Only approved months are counted. Totals are calculated in kg before rounding, so plant figures may not add up
					exactly to the totals shown. Select any approved figure to see how it was worked out.
				</p>
			</div>
		</AppLayout>
	);
}
