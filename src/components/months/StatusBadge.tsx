import type { ReportStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/workflow";

const TONES = {
	DRAFT: "neutral",
	SUBMITTED: "info",
	RETURNED: "warning",
	APPROVED: "success",
} as const satisfies Record<ReportStatus, string>;

/** A month's status. No status means the month has not been opened yet. */
export function StatusBadge({ status }: { status: ReportStatus | null }) {
	if (!status) {
		return <Badge tone="neutral">Not started</Badge>;
	}
	return (
		<Badge tone={TONES[status]} data-testid={`status-${status.toLowerCase()}`}>
			{STATUS_LABELS[status]}
		</Badge>
	);
}
