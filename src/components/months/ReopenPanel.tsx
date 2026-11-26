import { RotateCcw } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { OrenButton } from "@/components/ui/OrenButton";
import { OrenTextarea } from "@/components/ui/OrenTextarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MonthDetail } from "@/lib/schemas/month";
import { api } from "@/utils/api";

type Props = {
	month: MonthDetail;
	onConflict: (message: string) => void;
};

/**
 * The Head of Sustainability reopens an approved month with a reason (O2). It goes back to the plant as
 * "Sent back" and leaves the approved figures until approved again. Earlier approvals stay in the audit trail.
 */
export function ReopenPanel({ month, onConflict }: Props) {
	const utils = api.useContext();
	const [reason, setReason] = useState("");
	const reopen = api.review.reopen.useMutation({
		onSuccess: async () => {
			setReason("");
			await Promise.all([utils.month.byId.invalidate({ reportId: month.id }), utils.review.queue.invalidate()]);
			toast.success("Reopened. The plant can now correct it; it no longer counts until approved again.");
		},
		onError: (error) => {
			if (error.data?.code === "CONFLICT") {
				onConflict(error.message);
				return;
			}
			toast.error(error.message || "We could not reopen this month. Please try again.");
		},
	});

	return (
		<Card data-testid="reopen-panel">
			<CardHeader>
				<CardTitle>Reopen this month</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<OrenTextarea
					label="Reason"
					isRequired
					rows={3}
					maxLength={2000}
					value={reason}
					onChange={(event) => setReason(event.target.value)}
					helperText="The plant sees this. The month stops counting in approved figures until it is approved again."
					data-testid="reopen-reason"
				/>
				<OrenButton
					variant="secondary"
					leftIcon={<RotateCcw />}
					disabled={reopen.isLoading || reason.trim() === ""}
					isLoading={reopen.isLoading}
					loadingText="Reopening"
					onClick={() => reopen.mutate({ reportId: month.id, expectedVersion: month.version, comment: reason })}
					data-testid="reopen-submit"
				>
					Reopen Month
				</OrenButton>
			</CardContent>
		</Card>
	);
}
