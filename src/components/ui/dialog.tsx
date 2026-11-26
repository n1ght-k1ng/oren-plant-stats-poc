/** Dialog on Radix: header, body and footer, with Cancel to the left of the primary action. */
import { cva } from "class-variance-authority";
import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

const dialogContentV3Variants = cva(
	[
		"fixed left-1/2 top-1/2 z-50",
		"flex flex-col w-full max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]",
		"-translate-x-1/2 -translate-y-1/2",
		"rounded-[12px] border border-border-default bg-surface-card outline-none",
		"shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-4px_rgba(0,0,0,0.1)]",
		// Fade + zoom only: slide-* would compound with the translate centring.
		"data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
		"data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
		"data-[state=open]:duration-300 data-[state=open]:ease-out",
		"data-[state=closed]:duration-200 data-[state=closed]:ease-in",
	].join(" "),
	{
		variants: {
			size: {
				sm: "sm:max-w-[24rem]",
				md: "sm:max-w-[28rem]",
				lg: "sm:max-w-[32rem]",
				xl: "sm:max-w-[36rem]",
				"2xl": "sm:max-w-[42rem]",
				full: "sm:max-w-[calc(100vw-2rem)]",
			},
		},
		defaultVariants: { size: "md" },
	},
);

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogContent({
	className,
	children,
	size,
	showCloseButton = true,
	closeButtonDataTestId,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
	size?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
	showCloseButton?: boolean;
	closeButtonDataTestId?: string;
}) {
	return (
		<DialogPrimitive.Portal>
			<DialogPrimitive.Overlay
				className={cn(
					"fixed inset-0 z-50 bg-surface-overlay backdrop-blur-[12px]",
					"data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
				)}
			/>
			<DialogPrimitive.Content className={cn(dialogContentV3Variants({ size }), className)} {...props}>
				{showCloseButton && (
					<DialogPrimitive.Close
						data-testid={closeButtonDataTestId}
						aria-label="Close"
						className={cn(
							"absolute right-4 top-4 inline-flex size-7 items-center justify-center rounded",
							"text-text-secondary transition-colors duration-[120ms] hover:bg-surface-hover hover:text-text-primary",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
						)}
					>
						<XIcon className="size-4" aria-hidden />
					</DialogPrimitive.Close>
				)}
				{children}
			</DialogPrimitive.Content>
		</DialogPrimitive.Portal>
	);
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("flex shrink-0 flex-col px-6 pt-6 pb-2 pr-12 text-left", className)} {...props} />;
}

function DialogBody({
	className,
	scrollable = false,
	...props
}: React.ComponentProps<"div"> & { scrollable?: boolean }) {
	return (
		<div
			className={cn(
				"min-h-0 flex-1 px-6 py-4",
				scrollable ? "max-h-[60vh] overflow-y-auto" : "overflow-hidden",
				className,
			)}
			{...props}
		/>
	);
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("flex items-center justify-end gap-2 px-6 pt-4 pb-6", className)} {...props} />;
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
	return (
		<DialogPrimitive.Title
			className={cn("text-2xl leading-8 font-semibold tracking-[-0.01em] text-text-primary", className)}
			{...props}
		/>
	);
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
	return <DialogPrimitive.Description className={cn("mt-1 text-sm text-text-secondary", className)} {...props} />;
}

export {
	Dialog,
	DialogBody,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
};
