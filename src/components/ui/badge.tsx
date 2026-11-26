/** Badge: a small soft-coloured label for a type or a status. */
import { type VariantProps, cva } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium leading-5",
	{
		variants: {
			tone: {
				neutral: "bg-badge-neutral-soft-bg text-badge-neutral-soft-text",
				info: "bg-badge-info-soft-bg text-badge-info-soft-text",
				success: "bg-badge-success-soft-bg text-badge-success-soft-text",
				warning: "bg-badge-warning-soft-bg text-badge-warning-soft-text",
				error: "bg-badge-error-soft-bg text-badge-error-soft-text",
			},
		},
		defaultVariants: { tone: "neutral" },
	},
);

export type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

export function Badge({ tone, className, ...props }: BadgeProps) {
	return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
