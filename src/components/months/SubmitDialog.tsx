import { Send } from "lucide-react";
import { useEffect, useState } from "react";

import { FlagList } from "@/components/months/FlagList";
import { type Readiness, labelOf } from "@/components/months/monthForm";
import { OrenButton } from "@/components/ui/OrenButton";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { ItemKey } from "@/config/items";
import { hasWarnings } from "@/lib/checks";
import type { CheckFlag } from "@/lib/schemas/report";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	readiness: Readiness;
	flags: CheckFlag[];
	isSubmitting: boolean;
	onSubmit: (confirmNotUsed: ItemKey[]) => void;
};

/**
 * The last step of Flow 1. Blank optional items each need one click to confirm they were not used (P4);
 * flags are shown, but never block (D7).
 */
export function SubmitDialog({ open, onOpenChange, readiness, flags, isSubmitting, onSubmit }: Props) {
	const [confirmed, setConfirmed] = useState<ItemKey[]>([]);
	useEffect(() => {
		if (open) {
			setConfirmed([]);
		}
	}, [open]);

	const allConfirmed = readiness.optionalBlank.every((key) => confirmed.includes(key));
	const toggle = (key: ItemKey) =>
		setConfirmed((current) => (current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]));

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent closeButtonDataTestId="submit-close">
				<DialogHeader>
					<DialogTitle>Submit for review</DialogTitle>
					<DialogDescription>
						A reviewer will check this month. You can't change it while it waits, unless they send it back.
					</DialogDescription>
				</DialogHeader>
				<DialogBody className="flex flex-col gap-5">
					{readiness.optionalBlank.length > 0 && (
						<fieldset className="flex flex-col gap-2">
							<legend className="mb-2 text-sm font-medium text-text-primary">
								Confirm the items you left blank were not used this month
							</legend>
							{readiness.optionalBlank.map((key) => (
								<label
									key={key}
									className="flex cursor-pointer items-center gap-3 rounded-lg border-[1.5px] border-border-default px-3 py-2 text-sm hover:bg-surface-hover"
								>
									<input
										type="checkbox"
										className="size-4 accent-[var(--color-interactive-primary)]"
										checked={confirmed.includes(key)}
										onChange={() => toggle(key)}
										data-testid={`submit-not-used-${key}`}
									/>
									<span>
										<span className="font-medium">{labelOf(key)}</span>: not used this month
									</span>
								</label>
							))}
						</fieldset>
					)}

					<div className="flex flex-col gap-2">
						<p className="text-sm font-medium text-text-primary">
							{hasWarnings(flags) ? "The reviewer will see these flags" : "Flags"}
						</p>
						<FlagList flags={flags} live={false} />
					</div>
				</DialogBody>
				<DialogFooter>
					<OrenButton variant="secondary" onClick={() => onOpenChange(false)} data-testid="submit-cancel">
						Cancel
					</OrenButton>
					<OrenButton
						leftIcon={<Send />}
						disabled={!allConfirmed}
						isLoading={isSubmitting}
						loadingText="Submitting"
						onClick={() => onSubmit(confirmed)}
						data-testid="submit-confirm"
					>
						Submit Month
					</OrenButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
