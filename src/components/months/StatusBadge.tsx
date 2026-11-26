import type { ReportStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/workflow";

const TONES = {
	DRAFT: "neutral",
	SUBMITTED: "info",
	RETURNED: "warning",
	APPROVED: "success",
} as const satisfies Record<ReportStatus, string>;

/**
 * A month's status. No status means the month has not been opened yet. A month back with the plant because the
 * Head reopened an approved figure says "Reopened", not "Sent back" (docs/UX-REVIEW.md U23).
 */
export function StatusBadge({ status, reopened = false }: { status: ReportStatus | null; reopened?: boolean }) {
	if (!status) {
		return <Badge tone="neutral">Not started</Badge>;
	}
	if (status === "RETURNED" && reopened) {
		return (
			<Badge tone="error" data-testid="status-reopened">
				Reopened
			</Badge>
		);
	}
	return (
		<Badge tone={TONES[status]} data-testid={`status-${status.toLowerCase()}`}>
			{STATUS_LABELS[status]}
		</Badge>
	);
}
