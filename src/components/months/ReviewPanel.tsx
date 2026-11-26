import { CheckCircle2, Undo2 } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import toast from "react-hot-toast";

import { OrenButton } from "@/components/ui/OrenButton";
import { OrenTextarea } from "@/components/ui/OrenTextarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasWarnings } from "@/lib/checks";
import type { MonthDetail } from "@/lib/schemas/month";
import { api } from "@/utils/api";

type Props = {
	month: MonthDetail;
	onConflict: (message: string) => void;
};

/**
 * Flow 2: approve, or send back with a comment. Approving a flagged month needs a comment saying why the
 * flagged values are accepted (U6). The server enforces both; this only explains them up front.
 */
export function ReviewPanel({ month, onConflict }: Props) {
	const router = useRouter();
	const utils = api.useContext();
	const [comment, setComment] = useState("");
	const flagged = hasWarnings(month.flags);
	const hasComment = comment.trim().length > 0;

	const done = (message: string) => {
		// Take the month out of the cached queue first, so the queue never shows it again while it refetches
		// (docs/UX-REVIEW.md U29).
		utils.review.queue.setData(undefined, (queue) => queue?.filter((entry) => entry.reportId !== month.id));
		// Refresh in the background: going back to the queue doesn't wait for a slow connection.
		void utils.month.byId.invalidate({ reportId: month.id });
		void utils.review.queue.invalidate();
		toast.success(message);
		void router.push("/review");
	};
	const onError = (error: { message: string; data?: { code?: string } | null }) => {
		if (error.data?.code === "CONFLICT") {
			onConflict(error.message);
			return;
		}
		toast.error(error.message || "We could not record your review. Please try again.");
	};

	const approve = api.review.approve.useMutation({
		onSuccess: () => done("Approved. It now counts in the company figures."),
		onError,
	});
	const sendBack = api.review.sendBack.useMutation({
		onSuccess: () => done("Sent back to the plant with your comment."),
		onError,
	});
	const busy = approve.isLoading || sendBack.isLoading;

	return (
		<Card data-testid="review-panel">
			<CardHeader>
				<CardTitle>Your review</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<OrenTextarea
					label="Comment"
					rows={4}
					maxLength={2000}
					value={comment}
					onChange={(event) => setComment(event.target.value)}
					helperText={
						flagged
							? "This month has flags. To approve, explain why the flagged values are accepted. To send back, say what needs fixing."
							: "Optional to approve. To send back, say what needs fixing."
					}
					data-testid="review-comment"
				/>
				<div className="flex flex-col gap-2">
					<OrenButton
						leftIcon={<CheckCircle2 />}
						disabled={busy || (flagged && !hasComment)}
						isLoading={approve.isLoading}
						loadingText="Approving"
						onClick={() =>
							approve.mutate({ reportId: month.id, expectedVersion: month.version, comment: comment.trim() || null })
						}
						data-testid="review-approve"
					>
						Approve
					</OrenButton>
					<OrenButton
						variant="secondary"
						leftIcon={<Undo2 />}
						disabled={busy || !hasComment}
						isLoading={sendBack.isLoading}
						loadingText="Sending back"
						onClick={() => sendBack.mutate({ reportId: month.id, expectedVersion: month.version, comment })}
						data-testid="review-send-back"
					>
						Send Back
					</OrenButton>
				</div>
			</CardContent>
		</Card>
	);
}
