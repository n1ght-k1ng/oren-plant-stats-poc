/** OrenInput: a labelled input with helper or error text below. Pass `register` from react-hook-form. */
import { cva } from "class-variance-authority";
import { AlertCircle } from "lucide-react";
import * as React from "react";
import type { FieldError, UseFormRegisterReturn } from "react-hook-form";

import { cn } from "@/lib/utils";

export const inputV3InnerVariants = cva(
	[
		"w-full min-w-0 bg-surface-card text-text-primary",
		"border-[1.5px] rounded-lg border-border-input shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]",
		"transition-[color,border-color,box-shadow] duration-[120ms] ease-[cubic-bezier(0.25,0.1,0.25,1)]",
		"outline-none hover:border-border-strong",
		"focus:border-border-focus focus:shadow-[0_0_0_2px_#4682b480]",
		"placeholder:font-normal placeholder:text-text-placeholder",
		"disabled:cursor-not-allowed disabled:bg-surface-disabled disabled:text-text-disabled read-only:cursor-default",
		// error state: red border + red glow, also on hover and focus
		"aria-invalid:border-border-error aria-invalid:focus:shadow-[0_0_0_2px_#e53e3e33]",
	].join(" "),
	{
		variants: {
			v3Size: {
				sm: "h-8 px-3 text-xs",
				md: "h-9 px-3 text-sm",
				lg: "h-10 px-4 text-sm",
			},
		},
		defaultVariants: { v3Size: "md" },
	},
);

export type OrenInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
	label?: string;
	helperText?: string;
	isRequired?: boolean;
	/** react-hook-form field error; its message is shown under the field. */
	error?: FieldError;
	errorMessage?: string;
	register?: UseFormRegisterReturn;
	v3Size?: "sm" | "md" | "lg";
};

export const OrenInput = React.forwardRef<HTMLInputElement, OrenInputProps>(function OrenInput(
	{ label, helperText, isRequired, error, errorMessage, register, v3Size, id, className, ...props },
	ref,
) {
	const generatedId = React.useId();
	const inputId = id ?? register?.name ?? generatedId;
	const message = errorMessage ?? error?.message;
	const describedBy = message || helperText ? `${inputId}-message` : undefined;

	return (
		<div className={cn("flex w-full flex-col gap-1.5", className)}>
			{label && (
				<label htmlFor={inputId} className="text-sm font-medium leading-5 text-text-primary">
					{label}
					{isRequired && <span className="text-feedback-error-fg"> *</span>}
				</label>
			)}
			<input
				id={inputId}
				aria-invalid={message ? true : undefined}
				aria-describedby={describedBy}
				aria-required={isRequired || undefined}
				className={inputV3InnerVariants({ v3Size })}
				{...props}
				{...register}
				ref={(node) => {
					register?.ref(node);
					if (typeof ref === "function") {
						ref(node);
					} else if (ref) {
						ref.current = node;
					}
				}}
			/>
			{message ? (
				<p id={describedBy} className="flex items-center gap-1 text-xs leading-4 text-feedback-error-text">
					<AlertCircle className="size-3.5 shrink-0" aria-hidden />
					{message}
				</p>
			) : helperText ? (
				<p id={describedBy} className="text-xs leading-4 text-text-secondary">
					{helperText}
				</p>
			) : null}
		</div>
	);
});
