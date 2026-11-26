/**
 * The month's status machine (docs/DECISIONS.md O1, O2, O12, U6). Pure: no database, no permissions.
 * Who may take each action is decided separately, in src/lib/permissions.ts.
 *
 *   DRAFT ──submit──> SUBMITTED ──approve──> APPROVED
 *                        │                      │
 *                    send back               reopen
 *                        v                      │
 *                     RETURNED <────────────────┘
 *                        └──────submit──> SUBMITTED
 */
import type { ReportStatus, ReviewAction } from "@prisma/client";

export type WorkflowAction = "submit" | "approve" | "sendBack" | "reopen";

export const REVIEW_ACTION: Record<WorkflowAction, ReviewAction> = {
	submit: "SUBMIT",
	approve: "APPROVE",
	sendBack: "SEND_BACK",
	reopen: "REOPEN",
};

/** Where each action may start, and where it leads. Anything not listed is not allowed. */
const TRANSITIONS: Record<WorkflowAction, Partial<Record<ReportStatus, ReportStatus>>> = {
	submit: { DRAFT: "SUBMITTED", RETURNED: "SUBMITTED" },
	approve: { SUBMITTED: "APPROVED" },
	sendBack: { SUBMITTED: "RETURNED" },
	// Back to the data owner as RETURNED, not DRAFT, so the reason shows (O2).
	reopen: { APPROVED: "RETURNED" },
};

export const STATUS_LABELS: Record<ReportStatus, string> = {
	DRAFT: "Draft",
	SUBMITTED: "Waiting for review",
	RETURNED: "Sent back",
	APPROVED: "Approved",
};

const ACTION_VERBS: Record<WorkflowAction, string> = {
	submit: "submit",
	approve: "approve",
	sendBack: "send back",
	reopen: "reopen",
};

export type TransitionInput = {
	status: ReportStatus;
	action: WorkflowAction;
	comment?: string | null;
	/** Whether the month has plausibility flags. Approving a flagged month needs a comment (U6). */
	hasFlags: boolean;
};

export type TransitionError = "NOT_ALLOWED_FROM_STATUS" | "COMMENT_REQUIRED";

export type TransitionResult = { ok: true; to: ReportStatus } | { ok: false; error: TransitionError; message: string };

function commentRequirement(action: WorkflowAction, hasFlags: boolean): string | null {
	switch (action) {
		case "sendBack":
			return "Add a comment saying what needs fixing.";
		case "reopen":
			return "Add a reason for reopening this month.";
		case "approve":
			return hasFlags ? "This month has flags. Add a comment explaining why the flagged values are accepted." : null;
		case "submit":
			return null;
	}
}

export function transition({ status, action, comment, hasFlags }: TransitionInput): TransitionResult {
	const to = TRANSITIONS[action][status];
	if (!to) {
		return {
			ok: false,
			error: "NOT_ALLOWED_FROM_STATUS",
			message: `You can't ${ACTION_VERBS[action]} a month that is ${STATUS_LABELS[status].toLowerCase()}.`,
		};
	}
	const requirement = commentRequirement(action, hasFlags);
	if (requirement && !comment?.trim()) {
		return { ok: false, error: "COMMENT_REQUIRED", message: requirement };
	}
	return { ok: true, to };
}

/** Values can change only while the data owner holds the month (O1). */
export function canEditLines(status: ReportStatus): boolean {
	return status === "DRAFT" || status === "RETURNED";
}

/**
 * Whether a returned month is back with the plant because the Head reopened it (U23). Takes the month's
 * status and the action of its latest send-back or reopen event.
 */
export function wasReopened(status: ReportStatus, lastReturnAction: ReviewAction | null | undefined): boolean {
	return status === "RETURNED" && lastReturnAction === "REOPEN";
}
