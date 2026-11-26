import type { ReportStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type WorkflowAction, canEditLines, transition } from "@/lib/workflow";

// The month's status machine (docs/DECISIONS.md O1, O2, O12, U6).

const STATUSES: ReportStatus[] = ["DRAFT", "SUBMITTED", "RETURNED", "APPROVED"];
const ACTIONS: WorkflowAction[] = ["submit", "approve", "sendBack", "reopen"];

/** Every allowed move. Everything else must be refused. */
const ALLOWED: [WorkflowAction, ReportStatus, ReportStatus][] = [
	["submit", "DRAFT", "SUBMITTED"],
	["submit", "RETURNED", "SUBMITTED"],
	["approve", "SUBMITTED", "APPROVED"],
	["sendBack", "SUBMITTED", "RETURNED"],
	["reopen", "APPROVED", "RETURNED"],
];

describe("transition", () => {
	it.each(ALLOWED)("%s from %s goes to %s", (action, status, to) => {
		expect(transition({ status, action, comment: "Checked against the bill", hasFlags: false })).toEqual({
			ok: true,
			to,
		});
	});

	const refused = ACTIONS.flatMap((action) =>
		STATUSES.filter((status) => !ALLOWED.some(([a, s]) => a === action && s === status)).map(
			(status) => [action, status] as const,
		),
	);

	it("refuses every other move (11 of the 16)", () => {
		expect(refused).toHaveLength(11);
	});

	it.each(refused)("refuses %s from %s", (action, status) => {
		const result = transition({ status, action, comment: "A comment", hasFlags: false });
		expect(result).toMatchObject({ ok: false, error: "NOT_ALLOWED_FROM_STATUS" });
	});

	it("explains a refused move in words", () => {
		expect(transition({ status: "DRAFT", action: "approve", hasFlags: false })).toEqual({
			ok: false,
			error: "NOT_ALLOWED_FROM_STATUS",
			message: "You can't approve a month that is draft.",
		});
		expect(transition({ status: "APPROVED", action: "submit", hasFlags: false })).toMatchObject({
			message: "You can't submit a month that is approved.",
		});
	});

	it("reopens to RETURNED, not DRAFT", () => {
		expect(transition({ status: "APPROVED", action: "reopen", comment: "Bill corrected", hasFlags: false })).toEqual({
			ok: true,
			to: "RETURNED",
		});
	});
});

describe("comments", () => {
	it.each([
		["sendBack", "SUBMITTED", "Add a comment saying what needs fixing."],
		["reopen", "APPROVED", "Add a reason for reopening this month."],
	] as const)("%s needs a comment", (action, status, message) => {
		for (const comment of [undefined, null, "", "   "]) {
			expect(transition({ status, action, comment, hasFlags: false })).toEqual({
				ok: false,
				error: "COMMENT_REQUIRED",
				message,
			});
		}
	});

	it("approving without flags needs no comment", () => {
		expect(transition({ status: "SUBMITTED", action: "approve", hasFlags: false })).toEqual({
			ok: true,
			to: "APPROVED",
		});
	});

	it("approving with flags needs a comment explaining why the flagged values are accepted", () => {
		expect(transition({ status: "SUBMITTED", action: "approve", comment: " ", hasFlags: true })).toEqual({
			ok: false,
			error: "COMMENT_REQUIRED",
			message: "This month has flags. Add a comment explaining why the flagged values are accepted.",
		});
		expect(
			transition({
				status: "SUBMITTED",
				action: "approve",
				comment: "Figures match the plant's records",
				hasFlags: true,
			}),
		).toEqual({ ok: true, to: "APPROVED" });
	});

	it("submitting needs no comment", () => {
		expect(transition({ status: "DRAFT", action: "submit", hasFlags: true })).toEqual({ ok: true, to: "SUBMITTED" });
	});
});

describe("canEditLines", () => {
	it("allows edits only while the data owner holds the month", () => {
		expect(STATUSES.filter(canEditLines)).toEqual(["DRAFT", "RETURNED"]);
	});
});
