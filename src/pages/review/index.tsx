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
		</AppLayout>
	);
}
