import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import type { CheckFlag } from "@/lib/schemas/report";
import { cn } from "@/lib/utils";

/**
 * Plausibility flags (D7, N3). They describe what is unusual and never block anything. `live` means they
 * update as the data owner types; otherwise they are as frozen at submission (U2).
 */
export function FlagList({ flags, live }: { flags: CheckFlag[]; live: boolean }) {
	if (flags.length === 0) {
		return (
			<p className="flex items-center gap-2 text-sm text-text-secondary" data-testid="flags-none">
				<CheckCircle2 className="size-4 text-feedback-success-fg" aria-hidden />
				{live ? "Nothing unusual in the figures so far." : "Nothing unusual was flagged."}
			</p>
		);
	}
	return (
		<ul className="flex flex-col gap-2" data-testid="flags">
			{flags.map((flag) => {
				const warning = flag.severity === "warning";
				const Icon = warning ? AlertTriangle : Info;
				return (
					<li
						key={`${flag.code}-${flag.itemKeys.join("-")}`}
						className={cn(
							"flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
							warning ? "bg-surface-warning-subtle text-text-primary" : "bg-surface-muted text-text-secondary",
						)}
						data-testid={`flag-${flag.code}`}
					>
						<Icon
							className={cn("mt-0.5 size-4 shrink-0", warning ? "text-feedback-warning-fg" : "text-text-secondary")}
							aria-hidden
						/>
						<span>{flag.message}</span>
					</li>
				);
			})}
		</ul>
	);
}
