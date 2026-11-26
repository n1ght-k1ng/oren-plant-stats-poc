import { AlertTriangle, ClipboardCheck } from "lucide-react";
import { useRouter } from "next/router";

import { AppLayout } from "@/components/layout/AppLayout";
import { OrenButton } from "@/components/ui/OrenButton";
import { Badge } from "@/components/ui/badge";
import {
	EmptyState,
	EmptyStateActions,
	EmptyStateDescription,
	EmptyStateIcon,
	EmptyStateTitle,
} from "@/components/ui/empty-state";
import { PageHeader, PageHeaderDescription, PageHeaderHeading } from "@/components/ui/page-header";
import {
	Table,
	TableBody,
	TableCell,
	TableFullRow,
	TableHead,
	TableHeader,
	TableLoadingRows,
	TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { periodLabel } from "@/lib/periods";
import { api } from "@/utils/api";

const COLUMNS = 5;

/** Flow 2: months waiting for review, flagged ones first. */
export default function ReviewQueuePage() {
	const router = useRouter();
	const queue = api.review.queue.useQuery();
	const rows = queue.data ?? [];

	return (
		<AppLayout title="Review">
			<PageHeader bordered>
				<PageHeaderHeading>Review</PageHeaderHeading>
				<PageHeaderDescription>
					Months plants have submitted. Months with flags come first, then the ones waiting longest.
				</PageHeaderDescription>
			</PageHeader>

			{/* Phones get cards, so the Review button is never cut off (docs/UX-REVIEW.md U26). */}
			{queue.isSuccess && rows.length > 0 && (
				<ul className="flex flex-col gap-3 md:hidden" data-testid="review-cards">
					{rows.map((entry) => (
						<li
							key={entry.reportId}
							className="flex flex-col gap-3 rounded-lg border-[1.5px] border-border-default bg-surface-card p-4"
							data-testid={`review-card-${entry.plant.code}-${entry.period}`}
						>
							<div className="flex items-start justify-between gap-3">
								<div className="flex min-w-0 flex-col">
									<span className="font-semibold text-text-primary">
										{entry.plant.code} {entry.plant.name}
									</span>
									<span className="text-sm text-text-primary">{periodLabel(entry.period)}</span>
								</div>
								{entry.warningCount > 0 ? (
									<Badge tone="warning" className="shrink-0">
										{entry.warningCount} {entry.warningCount === 1 ? "flag" : "flags"}
									</Badge>
								) : (
									<span className="shrink-0 text-sm text-text-secondary">No flags</span>
								)}
							</div>
							<span className="text-xs text-text-secondary">
								Submitted by {entry.submittedBy}, {formatDateTime(entry.submittedAt)}
							</span>
							{entry.canReview ? (
								<OrenButton
									className="w-full"
									onClick={() => void router.push(`/months/${entry.reportId}`)}
									data-testid={`review-card-open-${entry.plant.code}-${entry.period}`}
								>
									Review
								</OrenButton>
							) : (
								<span className="text-xs text-text-secondary">Another reviewer must review this</span>
							)}
						</li>
					))}
				</ul>
			)}

			<div className={queue.isSuccess && rows.length > 0 ? "hidden md:block" : undefined}>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Plant</TableHead>
							<TableHead>Month</TableHead>
							<TableHead>Submitted</TableHead>
							<TableHead>Flags</TableHead>
							<TableHead align="right">
								<span className="sr-only">Action</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{queue.isLoading && <TableLoadingRows columns={COLUMNS} />}

						{queue.isError && (
							<TableFullRow columns={COLUMNS}>
								<EmptyState>
									<EmptyStateIcon icon={AlertTriangle} />
									<EmptyStateTitle>We could not load the review queue</EmptyStateTitle>
									<EmptyStateDescription>Check your connection, then try again.</EmptyStateDescription>
									<EmptyStateActions>
										<OrenButton data-testid="review-retry" onClick={() => void queue.refetch()}>
											Try Again
										</OrenButton>
									</EmptyStateActions>
								</EmptyState>
							</TableFullRow>
						)}

						{queue.isSuccess && rows.length === 0 && (
							<TableFullRow columns={COLUMNS}>
								<EmptyState>
									<EmptyStateIcon icon={ClipboardCheck} />
									<EmptyStateTitle>Nothing waiting for review</EmptyStateTitle>
									<EmptyStateDescription>Months appear here as soon as a plant submits them.</EmptyStateDescription>
								</EmptyState>
							</TableFullRow>
						)}

						{rows.map((entry) => (
							<TableRow
								key={entry.reportId}
								interactive
								onClick={() => void router.push(`/months/${entry.reportId}`)}
								data-testid={`review-row-${entry.plant.code}-${entry.period}`}
							>
								<TableCell className="font-medium">
									{entry.plant.code} {entry.plant.name}
								</TableCell>
								<TableCell>{periodLabel(entry.period)}</TableCell>
								<TableCell>
									<span className="block">{entry.submittedBy}</span>
									<span className="block text-xs text-text-secondary">{formatDateTime(entry.submittedAt)}</span>
								</TableCell>
								<TableCell>
									{entry.warningCount > 0 ? (
										<Badge tone="warning">
											{entry.warningCount} {entry.warningCount === 1 ? "flag" : "flags"}
										</Badge>
									) : (
										<span className="text-sm text-text-secondary">None</span>
									)}
								</TableCell>
								<TableCell align="right">
									{entry.canReview ? (
										<OrenButton
											size="sm"
											onClick={(event) => {
												event.stopPropagation();
												void router.push(`/months/${entry.reportId}`);
											}}
											data-testid={`review-open-${entry.plant.code}-${entry.period}`}
										>
											Review
										</OrenButton>
									) : (
										<span className="text-xs text-text-secondary">Another reviewer must review this</span>
									)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</AppLayout>
	);
}
