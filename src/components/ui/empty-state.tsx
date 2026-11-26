/** EmptyState: icon, title, description and an action. Also used for error states. */
import type { LucideIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

function EmptyState({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)} {...props} />;
}

function EmptyStateIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
	return (
		<div
			className={cn("mb-5 flex size-12 items-center justify-center rounded-full bg-badge-neutral-soft-bg", className)}
		>
			<Icon className="size-6 text-text-secondary" aria-hidden />
		</div>
	);
}

function EmptyStateTitle({ className, ...props }: React.ComponentProps<"h3">) {
	return <h3 className={cn("text-base font-semibold text-text-primary", className)} {...props} />;
}

function EmptyStateDescription({ className, ...props }: React.ComponentProps<"p">) {
	return <p className={cn("mt-2 max-w-[32rem] text-sm text-text-secondary", className)} {...props} />;
}

function EmptyStateActions({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("mt-6 flex items-center gap-3", className)} {...props} />;
}

export { EmptyState, EmptyStateActions, EmptyStateDescription, EmptyStateIcon, EmptyStateTitle };
