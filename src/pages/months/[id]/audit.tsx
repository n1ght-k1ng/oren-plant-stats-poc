import { AlertTriangle, ArrowLeft, SearchX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";

import { AppLayout } from "@/components/layout/AppLayout";
import { FlagList } from "@/components/months/FlagList";
import { StatusBadge } from "@/components/months/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, EmptyStateDescription, EmptyStateIcon, EmptyStateTitle } from "@/components/ui/empty-state";
import { PageHeader, PageHeaderDescription, PageHeaderHeading, PageHeaderRow } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTonnes } from "@/lib/co2";
import { sumDecimals } from "@/lib/decimal";
import { formatDateTime, formatDecimal } from "@/lib/format";
import { naLabel } from "@/lib/naWording";
import { periodLabel } from "@/lib/periods";
import { parseQuarterParam, quarterParam } from "@/lib/quarterParam";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import type { MonthAudit, TimelineEntry, TracedLine } from "@/lib/schemas/audit";
import { api } from "@/utils/api";

function roleLabel(role: string): string {
	return role in ROLE_LABELS ? ROLE_LABELS[role as Role] : role;
}

function Figure({ label, kg, testId }: { label: string; kg: string; testId: string }) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs font-medium uppercase tracking-wide text-text-secondary">{label}</span>
			<span className="text-2xl font-semibold tabular-nums text-text-primary" data-testid={testId}>
				{formatTonnes(kg)} t CO2
			</span>
			<span className="text-xs tabular-nums text-text-secondary">{formatDecimal(kg)} kg</span>
		</div>
	);
}

function typed(line: TracedLine): string {
	if (line.typedValue && line.typedUnit) {
		return `${line.typedValue} ${line.typedUnit}`;
	}
	return line.state === "NA" ? naLabel(line.naReason) : "Not recorded";
}

function ScopeTable({ scope, lines, totalKg }: { scope: 1 | 2; lines: TracedLine[]; totalKg: string }) {
	const counted = lines.filter((line) => line.scope === scope);
	return (
		<div className="overflow-x-auto" data-testid={`audit-scope-${scope}`}>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Item</TableHead>
						<TableHead>Typed as</TableHead>
						<TableHead align="right">Converted to</TableHead>
						<TableHead align="right">× kg CO2 per unit</TableHead>
						<TableHead align="right">= kg CO2</TableHead>
						<TableHead>Factor source and year</TableHead>
						<TableHead>Entered by</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{counted.map((line) => (
						<TableRow key={line.itemKey} data-testid={`audit-line-${line.itemKey}`}>
							<TableCell className="font-medium">
								{line.label}
								{line.note && <span className="block text-xs font-normal text-text-secondary">Note: {line.note}</span>}
							</TableCell>
							<TableCell className="tabular-nums" data-testid={`audit-typed-${line.itemKey}`}>
								{typed(line)}
								{line.source === "IMPORT" && <span className="block text-xs text-text-secondary">Imported</span>}
							</TableCell>
							<TableCell align="right" className="tabular-nums">
								{line.value ? `${formatDecimal(line.value)} ${line.unit}` : ""}
							</TableCell>
							<TableCell align="right" className="tabular-nums">
								{line.kgCo2PerUnit ? `${formatDecimal(line.kgCo2PerUnit)} per ${line.unit}` : ""}
							</TableCell>
							<TableCell align="right" className="font-medium tabular-nums" data-testid={`audit-kg-${line.itemKey}`}>
								{line.kgCo2 ? formatDecimal(line.kgCo2) : ""}
							</TableCell>
							<TableCell className="max-w-72 text-xs text-text-secondary">
								<span className="block font-medium text-text-primary">{line.factorYear}</span>
								{line.factorSource}
							</TableCell>
							<TableCell className="text-sm">
								{line.enteredBy ?? "Set by the app"}
								{line.enteredAt && (
									<span className="block text-xs text-text-secondary">{formatDateTime(line.enteredAt)}</span>
								)}
							</TableCell>
						</TableRow>
					))}
					<TableRow>
						<TableCell className="font-semibold" colSpan={4}>
							Scope {scope} total
						</TableCell>
						<TableCell align="right" className="font-semibold tabular-nums" data-testid={`audit-scope-${scope}-total`}>
							{formatDecimal(totalKg)}
						</TableCell>
						<TableCell colSpan={2} className="text-sm text-text-secondary">
							= {formatTonnes(totalKg)} t CO2
						</TableCell>
					</TableRow>
				</TableBody>
			</Table>
		</div>
	);
}

const KIND_WORDS: Record<TimelineEntry["kind"], string> = {
	EDIT: "Edited",
	CONFIRM_NOT_USED: "Confirmed not used",
	SUBMIT: "Submitted",
	SEND_BACK: "Sent back",
	APPROVE: "Approved",
	REOPEN: "Reopened",
};

function Timeline({ audit }: { audit: MonthAudit }) {
	return (
		<ol className="flex flex-col divide-y divide-border-default" data-testid="audit-timeline">
			{audit.timeline.map((entry, index) => (
				<li key={`${entry.kind}-${entry.at.toISOString()}-${index}`} className="flex flex-col gap-2 py-4 first:pt-0">
					<div className="flex flex-wrap items-baseline gap-x-2 text-sm">
						<span className="font-semibold text-text-primary">{KIND_WORDS[entry.kind]}</span>
						<span className="text-text-primary">
							by {entry.actor.name} ({roleLabel(entry.actor.role)})
						</span>
						<span className="text-xs text-text-secondary">{formatDateTime(entry.at)}</span>
					</div>
					{entry.comment && <p className="text-sm text-text-primary">"{entry.comment}"</p>}
					{entry.changes.length > 0 && (
						<ul className="flex flex-col gap-0.5 text-sm text-text-primary">
							{entry.changes.map((change) => (
								<li key={change.label}>
									{change.label}: {change.from ?? "none"} → <span className="font-medium">{change.to ?? "none"}</span>
								</li>
							))}
						</ul>
					)}
					{entry.flags && <FlagList flags={entry.flags} live={false} />}
					{entry.totals && (
						<p className="text-sm text-text-primary">
							Recorded Scope 1 {formatTonnes(entry.totals.scope1KgCo2)} t and Scope 2{" "}
							{formatTonnes(entry.totals.scope2KgCo2)} t CO2.
						</p>
					)}
				</li>
			))}
		</ol>
	);
}

/** The audit trail (3.8): how a month's approved figures came to be, for an auditor. */
export default function AuditPage() {
	const router = useRouter();
	// Opened from a dashboard figure: go back to that quarter (U38b).
	const fromQuarter = router.query.from === "dashboard" ? parseQuarterParam(router.query.quarter) : null;
	const reportId = typeof router.query.id === "string" ? router.query.id : "";
	const audit = api.month.audit.useQuery({ reportId }, { enabled: reportId !== "", retry: false });

	if (audit.isError) {
		const notFound = audit.error.data?.code === "NOT_FOUND";
		return (
			<AppLayout title="Audit trail">
				<EmptyState>
					<EmptyStateIcon icon={notFound ? SearchX : AlertTriangle} />
					<EmptyStateTitle>
						{notFound ? "We could not find this month" : "We could not load the audit trail"}
					</EmptyStateTitle>
					<EmptyStateDescription>
						{notFound ? "The link may be wrong." : "Check your connection, then try again."}
					</EmptyStateDescription>
				</EmptyState>
			</AppLayout>
		);
	}
	if (!audit.data) {
		return (
			<AppLayout title="Audit trail">
				<div className="flex flex-col gap-3" aria-busy>
					<Skeleton className="h-8 w-96" />
					<Skeleton className="mt-4 h-40 w-full" />
					<Skeleton className="h-96 w-full" />
				</div>
			</AppLayout>
		);
	}

	const data = audit.data;
	const approval = data.approval;
	const notCounted = approval?.lines.filter((line) => line.state === "NA") ?? [];

	return (
		<AppLayout title={`Audit: ${data.plant.code} ${periodLabel(data.period)}`}>
			<Link
				href={fromQuarter ? `/dashboard?quarter=${quarterParam(fromQuarter)}` : `/months/${data.id}`}
				className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-link hover:text-text-link-hover"
				data-testid="audit-back"
			>
				<ArrowLeft className="size-4" aria-hidden />
				{fromQuarter ? "Back to the dashboard" : "Back to the month"}
			</Link>
			<PageHeader bordered>
				<PageHeaderRow>
					<div className="flex flex-col gap-1">
						<PageHeaderHeading>
							Audit trail: {data.plant.code} {data.plant.name}, {periodLabel(data.period)}
						</PageHeaderHeading>
						<PageHeaderDescription>
							How each approved figure was worked out, from what the plant typed, and every step since.
						</PageHeaderDescription>
					</div>
					<StatusBadge status={data.status} reopened={data.reopened} />
				</PageHeaderRow>
			</PageHeader>

			<div className="flex flex-col gap-6">
				<Card>
					<CardHeader>
						<CardTitle>Approved figures</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-5">
						{approval ? (
							<>
								<div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
									<Figure label="Scope 1" kg={approval.scope1KgCo2} testId="audit-scope1" />
									<Figure label="Scope 2" kg={approval.scope2KgCo2} testId="audit-scope2" />
									<Figure
										label="Total"
										kg={sumDecimals([approval.scope1KgCo2, approval.scope2KgCo2]).toFixed()}
										testId="audit-total"
									/>
								</div>
								<div className="flex flex-col gap-1 text-sm text-text-primary" data-testid="audit-approved-by">
									<span>
										Approved by <span className="font-medium">{approval.approvedBy.name}</span> (
										{roleLabel(approval.approvedBy.role)}) on {formatDateTime(approval.approvedAt)}
										{approval.comment && <>: "{approval.comment}"</>}
									</span>
									{approval.submittedBy && approval.submittedAt && (
										<span className="text-text-secondary">
											Submitted by {approval.submittedBy} on {formatDateTime(approval.submittedAt)}
										</span>
									)}
									<span className="text-xs text-text-secondary">
										Totals are calculated in kg before rounding; tonnes are rounded to one decimal place.
									</span>
								</div>
							</>
						) : (
							<p className="text-sm text-text-secondary" data-testid="audit-no-approval">
								{data.status === "APPROVED"
									? "No approval record found."
									: "This month has no approved figures now, so nothing from it counts in the company totals."}
							</p>
						)}
					</CardContent>
				</Card>

				{approval && (
					<Card>
						<CardHeader>
							<CardTitle>How the approved figures were calculated</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-6">
							<ScopeTable scope={1} lines={approval.lines} totalKg={approval.scope1KgCo2} />
							<ScopeTable scope={2} lines={approval.lines} totalKg={approval.scope2KgCo2} />
							{notCounted.length > 0 && (
								<p className="text-sm text-text-secondary" data-testid="audit-not-counted">
									Not counted:{" "}
									{notCounted
										.map(
											(line) =>
												`${line.label} (${typed(line).toLowerCase()}${line.enteredBy ? `, ${line.enteredBy}` : ""})`,
										)
										.join("; ")}
									.
								</p>
							)}
						</CardContent>
					</Card>
				)}

				{data.earlierApprovals.length > 0 && (
					<Card>
						<CardHeader>
							<CardTitle>Earlier approvals, later reopened</CardTitle>
						</CardHeader>
						<CardContent>
							<ul className="flex flex-col gap-2 text-sm" data-testid="audit-earlier-approvals">
								{data.earlierApprovals.map((earlier) => (
									<li key={earlier.approvedAt.toISOString()}>
										{formatDateTime(earlier.approvedAt)}: Scope 1 {formatTonnes(earlier.scope1KgCo2)} t, Scope 2{" "}
										{formatTonnes(earlier.scope2KgCo2)} t, approved by {earlier.approvedBy.name}. No longer counted.
									</li>
								))}
							</ul>
						</CardContent>
					</Card>
				)}

				<Card>
					<CardHeader>
						<CardTitle>Every step</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{data.draftEditsHidden && (
							<p className="text-xs text-text-secondary">
								Edits being made now are shown once the month is submitted again.
							</p>
						)}
						<Timeline audit={data} />
					</CardContent>
				</Card>
			</div>
		</AppLayout>
	);
}
