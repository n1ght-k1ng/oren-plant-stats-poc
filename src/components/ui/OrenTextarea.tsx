/** OrenTextarea: a labelled multi-line input with helper or error text below. Pass `register` from react-hook-form. */
import { AlertCircle } from "lucide-react";
import * as React from "react";
import type { FieldError, UseFormRegisterReturn } from "react-hook-form";

import { cn } from "@/lib/utils";

export type OrenTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
	label?: string;
	helperText?: string;
	isRequired?: boolean;
	error?: FieldError;
	errorMessage?: string;
	register?: UseFormRegisterReturn;
};

export const OrenTextarea = React.forwardRef<HTMLTextAreaElement, OrenTextareaProps>(function OrenTextarea(
	{ label, helperText, isRequired, error, errorMessage, register, id, className, rows = 3, ...props },
	ref,
) {
	const generatedId = React.useId();
	const textareaId = id ?? register?.name ?? generatedId;
	const message = errorMessage ?? error?.message;
	const describedBy = message || helperText ? `${textareaId}-message` : undefined;

	return (
		<div className={cn("flex w-full flex-col gap-1.5", className)}>
			{label && (
				<label htmlFor={textareaId} className="text-sm font-medium leading-5 text-text-primary">
					{label}
					{isRequired && <span className="text-feedback-error-fg"> *</span>}
				</label>
			)}
			<textarea
				id={textareaId}
				rows={rows}
				aria-invalid={message ? true : undefined}
				aria-describedby={describedBy}
				aria-required={isRequired || undefined}
				className={cn(
					"w-full min-w-0 resize-y rounded-lg border-[1.5px] border-border-input bg-surface-card px-3 py-2 text-sm text-text-primary",
					"shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] outline-none transition-[color,border-color,box-shadow] duration-[120ms]",
					"hover:border-border-strong focus:border-border-focus focus:shadow-[0_0_0_2px_#4682b480]",
					"placeholder:text-text-placeholder disabled:cursor-not-allowed disabled:bg-surface-disabled",
					"aria-invalid:border-border-error",
				)}
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
