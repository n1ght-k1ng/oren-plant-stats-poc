/** Select on Radix, plus `OrenSelect`, a labelled field. Use `OrenSelect` with a react-hook-form `Controller`. */
import { cva } from "class-variance-authority";
import { AlertCircle, CheckIcon, ChevronDownIcon } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import * as React from "react";
import type { FieldError } from "react-hook-form";

import { cn } from "@/lib/utils";

const selectTriggerV3Variants = cva(
	[
		"flex min-w-0 w-full max-w-full items-center justify-between gap-2",
		"overflow-hidden whitespace-nowrap cursor-pointer",
		"rounded-lg border-[1.5px] px-3",
		"bg-surface-card text-text-primary border-border-input shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]",
		"transition-[color,border-color,box-shadow] duration-[120ms] ease-[cubic-bezier(0.25,0.1,0.25,1)]",
		"outline-none hover:border-border-strong",
		"focus-visible:border-border-focus focus-visible:shadow-[0_0_0_2px_#4682b480] data-[state=open]:border-border-focus",
		"aria-invalid:border-border-error",
		"data-[placeholder]:text-text-placeholder",
		"disabled:cursor-not-allowed disabled:pointer-events-none disabled:bg-surface-disabled disabled:text-text-disabled disabled:opacity-70",
		"[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	].join(" "),
	{
		variants: {
			size: {
				sm: "h-8 text-xs leading-5",
				md: "h-9 text-sm leading-6",
				lg: "h-10 text-sm leading-6",
			},
		},
		defaultVariants: { size: "md" },
	},
);

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.Trigger>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & { size?: "sm" | "md" | "lg" }
>(function SelectTrigger({ className, size, children, ...props }, ref) {
	return (
		<SelectPrimitive.Trigger ref={ref} className={cn(selectTriggerV3Variants({ size }), className)} {...props}>
			<span className="min-w-0 truncate">{children}</span>
			<SelectPrimitive.Icon asChild>
				<ChevronDownIcon className="size-4 text-text-placeholder" />
			</SelectPrimitive.Icon>
		</SelectPrimitive.Trigger>
	);
});

const SelectContent = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(function SelectContent({ className, children, position = "popper", ...props }, ref) {
	return (
		<SelectPrimitive.Portal>
			<SelectPrimitive.Content
				ref={ref}
				position={position}
				className={cn(
					"relative z-[60] min-w-32 overflow-x-hidden overflow-y-auto",
					"rounded-lg border-[1.5px] border-border-default bg-surface-card shadow-md",
					"data-[state=open]:animate-in data-[state=closed]:animate-out",
					"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
					"data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
					"max-h-(--radix-select-content-available-height)",
					position === "popper" && "w-(--radix-select-trigger-width) data-[side=bottom]:translate-y-1",
					className,
				)}
				{...props}
			>
				<SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
			</SelectPrimitive.Content>
		</SelectPrimitive.Portal>
	);
});

const SelectItem = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.Item>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(function SelectItem({ className, children, ...props }, ref) {
	return (
		<SelectPrimitive.Item
			ref={ref}
			className={cn(
				"relative flex w-full cursor-pointer items-center gap-2",
				"rounded py-1.5 pr-8 pl-3 text-sm outline-hidden select-none text-text-primary",
				"data-[highlighted]:bg-surface-muted data-[state=checked]:font-medium",
				"data-disabled:pointer-events-none data-disabled:opacity-50",
				className,
			)}
			{...props}
		>
			<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
			<span className="absolute right-2 flex size-4 items-center justify-center">
				<SelectPrimitive.ItemIndicator>
					<CheckIcon className="size-4 text-interactive-primary" />
				</SelectPrimitive.ItemIndicator>
			</span>
		</SelectPrimitive.Item>
	);
});

type OrenSelectOption = string | { label: string; value: string };

export type OrenSelectProps = {
	label?: string;
	helperText?: string;
	placeholder?: string;
	options: OrenSelectOption[];
	value?: string;
	onValueChange?: (value: string) => void;
	isRequired?: boolean;
	error?: FieldError;
	errorMessage?: string;
	size?: "sm" | "md" | "lg";
	disabled?: boolean;
	id?: string;
	name?: string;
	className?: string;
	"data-testid"?: string;
};

function OrenSelect({
	label,
	helperText,
	placeholder = "Select",
	options,
	value,
	onValueChange,
	isRequired,
	error,
	errorMessage,
	size,
	disabled,
	id,
	name,
	className,
	"data-testid": testId,
}: OrenSelectProps) {
	const generatedId = React.useId();
	const triggerId = id ?? name ?? generatedId;
	const message = errorMessage ?? error?.message;
	const describedBy = message || helperText ? `${triggerId}-message` : undefined;

	return (
		<div className={cn("flex w-full flex-col gap-1.5", className)}>
			{label && (
				<label htmlFor={triggerId} className="text-sm font-medium leading-5 text-text-primary">
					{label}
					{isRequired && <span className="text-feedback-error-fg"> *</span>}
				</label>
			)}
			<Select value={value} onValueChange={onValueChange} disabled={disabled} name={name}>
				<SelectTrigger
					id={triggerId}
					size={size}
					data-testid={testId}
					aria-invalid={message ? true : undefined}
					aria-describedby={describedBy}
				>
					<SelectValue placeholder={placeholder} />
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => {
						const item = typeof option === "string" ? { label: option, value: option } : option;
						return (
							<SelectItem key={item.value} value={item.value}>
								{item.label}
							</SelectItem>
						);
					})}
				</SelectContent>
			</Select>
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
}

export { OrenSelect, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue };
