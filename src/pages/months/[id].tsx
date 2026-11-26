import { AlertTriangle, ArrowLeft, FileSearch, MessageSquareWarning, RefreshCw, SearchX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";

import { AppLayout } from "@/components/layout/AppLayout";
import { MonthEditor } from "@/components/months/MonthEditor";
import { MonthReadOnly } from "@/components/months/MonthReadOnly";
import { ReopenPanel } from "@/components/months/ReopenPanel";
import { ReviewPanel } from "@/components/months/ReviewPanel";
import { StatusBadge } from "@/components/months/StatusBadge";
import { OrenButton } from "@/components/ui/OrenButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	EmptyState,
	EmptyStateActions,
	EmptyStateDescription,
	EmptyStateIcon,
	EmptyStateTitle,
} from "@/components/ui/empty-state";
import { PageHeader, PageHeaderDescription, PageHeaderHeading, PageHeaderRow } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { periodLabel } from "@/lib/periods";
import { ROLES, ROLE_LABELS, type Role, hasRole } from "@/lib/roles";
import type { MonthDetail } from "@/lib/schemas/month";
import { STATUS_LABELS } from "@/lib/workflow";
import { api } from "@/utils/api";

const ACTION_WORDS = {
	SUBMIT: "Submitted",
	APPROVE: "Approved",
	SEND_BACK: "Sent back",
	REOPEN: "Reopened",
} as const;

function History({ month }: { month: MonthDetail }) {
	if (month.history.length === 0) {
		return <p className="text-sm text-text-secondary">Not submitted yet.</p>;
	}
	return (
		<ol className="flex flex-col gap-3" data-testid="month-history">
			{month.history.map((event) => (
				<li key={event.sequence} className="flex flex-col gap-0.5 text-sm">
					<span className="text-text-primary">
						<span className="font-medium">{ACTION_WORDS[event.action]}</span> by {event.actorName}
						{event.actorRole in ROLE_LABELS ? ` (${ROLE_LABELS[event.actorRole as Role]})` : ""}
					</span>
					{event.comment && <span className="text-text-primary">"{event.comment}"</span>}
					{event.changes.length > 0 && (
						<ul
							className="mt-1 flex flex-col gap-0.5 text-text-primary"
							data-testid={`history-changes-${event.sequence}`}
						>
							{event.changes.map((change) => (
								<li key={`${change.label}`}>
									Changed {change.label.charAt(0).toLowerCase() + change.label.slice(1)} from {change.from} to{" "}
									<span className="font-medium">{change.to}</span>
								</li>
							))}
						</ul>
					)}
					<span className="text-xs text-text-secondary">
						{formatDateTime(event.createdAt)} · now {STATUS_LABELS[event.toStatus].toLowerCase()}
					</span>
				</li>
			))}
		</ol>
	);
}

export default function MonthPage() {
	const router = useRouter();
	const reportId = typeof router.query.id === "string" ? router.query.id : "";
	const month = api.month.byId.useQuery({ reportId }, { enabled: reportId !== "", retry: false });
	const me = api.session.me.useQuery();
	const [conflict, setConflict] = useState<string | null>(null);

	async function reload() {
		setConflict(null);
		await month.refetch();
	}

	if (month.isError) {
		const notFound = month.error.data?.code === "NOT_FOUND";
		return (
			<AppLayout title="Month">
				<EmptyState>
					<EmptyStateIcon icon={notFound ? SearchX : AlertTriangle} />
					<EmptyStateTitle>
						{notFound ? "We could not find this month" : "We could not load this month"}
					</EmptyStateTitle>
					<EmptyStateDescription>
						{notFound ? "The link may be wrong." : "Check your connection, then try again."}
					</EmptyStateDescription>
					<EmptyStateActions>
						<OrenButton
							variant="secondary"
							onClick={() => void router.push("/months")}
							data-testid="month-back-to-list"
						>
							Back to Monthly Data
						</OrenButton>
					</EmptyStateActions>
				</EmptyState>
			</AppLayout>
		);
	}

	if (!month.data) {
		return (
			<AppLayout title="Month">
				<div className="flex flex-col gap-3" aria-busy>
					<Skeleton className="h-8 w-80" />
					<Skeleton className="mt-4 h-96 w-full" />
				</div>
			</AppLayout>
		);
	}

	const data = month.data;
	// Reviewers come here from the review queue; data owners from their months.
	const fromReview = !data.canEdit && me.data ? hasRole(me.data, ROLES.REVIEWER, ROLES.SUSTAINABILITY_HEAD) : false;
	const back = fromReview ? { href: "/review", label: "Review" } : { href: "/months", label: "Monthly data" };
	return (
		<AppLayout title={`${data.plant.code} ${periodLabel(data.period)}`}>
			<Link
				href={back.href}
				className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-link hover:text-text-link-hover"
				data-testid="month-back"
			>
				<ArrowLeft className="size-4" aria-hidden />
				{back.label}
			</Link>
			<PageHeader bordered>
				<PageHeaderRow>
					<div className="flex flex-col gap-1">
						<PageHeaderHeading>
							{data.plant.code} {data.plant.name}: {periodLabel(data.period)}
						</PageHeaderHeading>
						<PageHeaderDescription>
							{data.canEdit
								? "Enter each item in the unit on your report. Save at any time and come back later."
								: "This month can't be changed now."}
						</PageHeaderDescription>
					</div>
					<div className="flex items-center gap-3">
						<StatusBadge status={data.status} />
						<Link
							href={`/months/${data.id}/audit`}
							className="inline-flex items-center gap-1.5 text-sm text-text-link hover:text-text-link-hover"
							data-testid="month-audit-link"
						>
							<FileSearch className="size-4" aria-hidden />
							Audit trail
						</Link>
					</div>
				</PageHeaderRow>
			</PageHeader>

			{conflict && (
				<div
					className="mb-6 flex flex-wrap items-center gap-3 rounded-lg bg-surface-warning-subtle px-4 py-3 text-sm text-text-primary"
					role="alert"
					data-testid="month-conflict"
				>
					<AlertTriangle className="size-4 text-feedback-warning-fg" aria-hidden />
					<span className="flex-1">{conflict} Changes you haven't saved will be lost.</span>
					<OrenButton size="sm" leftIcon={<RefreshCw />} onClick={() => void reload()} data-testid="month-reload">
						Reload
					</OrenButton>
				</div>
			)}

			{data.returnComment && (
				<div
					className="mb-6 flex items-start gap-3 rounded-lg bg-surface-warning-subtle px-4 py-3 text-sm"
					data-testid="month-return-comment"
				>
					<MessageSquareWarning className="mt-0.5 size-4 shrink-0 text-feedback-warning-fg" aria-hidden />
					<div className="flex flex-col gap-1">
						<span className="font-medium text-text-primary">
							{data.returnComment.action === "REOPEN" ? "Reopened" : "Sent back"} by {data.returnComment.by}
						</span>
						<span className="text-text-primary">"{data.returnComment.text}"</span>
						<span className="text-xs text-text-secondary">{formatDateTime(data.returnComment.at)}</span>
					</div>
				</div>
			)}

			{data.canEdit ? (
				<MonthEditor month={data} onConflict={setConflict} />
			) : (
				<MonthReadOnly
					month={data}
					aside={
						data.review.canReview ? (
							<ReviewPanel month={data} onConflict={setConflict} />
						) : data.canReopen ? (
							<ReopenPanel month={data} onConflict={setConflict} />
						) : data.review.blockedReason ? (
							<Card data-testid="review-blocked">
								<CardContent className="pt-5 text-sm text-text-secondary">{data.review.blockedReason}</CardContent>
							</Card>
						) : undefined
					}
				/>
			)}

			<Card className="mt-6">
				<CardHeader>
					<CardTitle>History</CardTitle>
				</CardHeader>
				<CardContent>
					<History month={data} />
				</CardContent>
			</Card>
		</AppLayout>
	);
}
