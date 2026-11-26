/**
 * OrenButton: primary actions use `solid`, Cancel and other secondary actions use `secondary`,
 * delete uses `destructive`.
 */
import { type VariantProps, cva } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
	[
		"inline-flex items-center justify-center gap-2 whitespace-nowrap",
		"rounded-[10px]",
		"text-sm font-semibold",
		"cursor-pointer",
		"transition-all duration-[120ms] ease-[cubic-bezier(0.25,0.1,0.25,1)]",
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-border-focus",
		"active:scale-[0.98]",
		"disabled:cursor-not-allowed",
		"[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	].join(" "),
	{
		variants: {
			variant: {
				// Filled variants: grey fill when disabled. Transparent ones: muted text only.
				solid:
					"shadow-sm bg-interactive-primary text-white enabled:hover:bg-interactive-primary-hover disabled:bg-interactive-disabled disabled:text-text-disabled",
				secondary:
					"bg-surface-muted text-text-primary enabled:hover:bg-surface-hover disabled:bg-interactive-disabled disabled:text-text-disabled",
				outline:
					"border bg-transparent border-border-default text-text-primary enabled:hover:bg-surface-hover disabled:text-text-disabled",
				ghost: "text-text-primary enabled:hover:bg-surface-hover disabled:text-text-disabled",
				link: "text-text-link underline-offset-4 enabled:hover:underline enabled:hover:text-text-link-hover active:scale-100 disabled:text-text-disabled",
				destructive:
					"bg-badge-error-soft-bg text-feedback-error-text enabled:hover:bg-feedback-error-bg focus-visible:ring-feedback-error-fg disabled:bg-interactive-disabled disabled:text-text-disabled",
			},
			size: {
				sm: "h-8 px-3 gap-1.5 text-xs",
				md: "h-9 px-4 gap-2",
				lg: "h-10 px-5 gap-2",
			},
			rounded: { true: "rounded-full", false: "" },
			iconOnly: { true: "", false: "" },
		},
		compoundVariants: [
			{ iconOnly: true, size: "sm", className: "size-8 px-0" },
			{ iconOnly: true, size: "md", className: "size-9 px-0" },
			{ iconOnly: true, size: "lg", className: "size-10 px-0" },
		],
		defaultVariants: { variant: "solid", size: "md", iconOnly: false, rounded: false },
	},
);

export type OrenButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
	VariantProps<typeof buttonVariants> & {
		isLoading?: boolean;
		/** Text shown while loading. */
		loadingText?: string;
		leftIcon?: React.ReactNode;
		rightIcon?: React.ReactNode;
		/** Square icon-only button. Pass `aria-label`; never for a primary action. */
		iconOnly?: boolean;
	};

export const OrenButton = React.forwardRef<HTMLButtonElement, OrenButtonProps>(function OrenButton(
	{
		variant,
		size,
		rounded,
		iconOnly = false,
		isLoading = false,
		loadingText,
		leftIcon,
		rightIcon,
		disabled,
		className,
		children,
		type = "button",
		...props
	},
	ref,
) {
	return (
		<button
			ref={ref}
			type={type}
			disabled={disabled || isLoading}
			aria-busy={isLoading || undefined}
			className={cn(buttonVariants({ variant, size, rounded, iconOnly }), className)}
			{...props}
		>
			{isLoading ? (
				<>
					<Loader2 className="size-4 animate-spin" aria-hidden />
					{loadingText ? <span>{loadingText}</span> : iconOnly ? null : children}
				</>
			) : (
				<>
					{leftIcon && <span className="shrink-0 [&_svg]:size-4">{leftIcon}</span>}
					{children}
					{rightIcon && <span className="shrink-0 [&_svg]:size-4">{rightIcon}</span>}
				</>
			)}
		</button>
	);
});
