/** Table: `TableLoadingRows` and `TableFullRow` give a table its loading, empty and error states. */
import type * as React from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Align = "left" | "center" | "right";
const alignClass: Record<Align, string> = { left: "text-left", center: "text-center", right: "text-right" };

function Table({
	className,
	containerClassName,
	...props
}: React.ComponentProps<"table"> & { containerClassName?: string }) {
	return (
		<div
			data-slot="table-container"
			className={cn("relative w-full overflow-hidden rounded-lg border border-border-default", containerClassName)}
		>
			<div className="oren-scrollbar-v3 w-full overflow-x-auto">
				<table
					data-slot="table"
					className={cn("w-full caption-bottom border-collapse text-text-primary", className)}
					{...props}
				/>
			</div>
		</div>
	);
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
	return (
		<thead
			data-slot="table-header"
			className={cn("border-b border-border-default bg-surface-muted", className)}
			{...props}
		/>
	);
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
	return (
		<tbody data-slot="table-body" className={cn("bg-surface-card [&_tr:last-child]:border-0", className)} {...props} />
	);
}

function TableRow({
	className,
	interactive = false,
	selected = false,
	...props
}: React.ComponentProps<"tr"> & { interactive?: boolean; selected?: boolean }) {
	return (
		<tr
			data-slot="table-row"
			data-state={selected ? "selected" : undefined}
			className={cn(
				"group border-b border-border-default transition-colors duration-[120ms] hover:bg-surface-hover",
				selected && "bg-surface-hover",
				interactive && "cursor-pointer",
				className,
			)}
			{...props}
		/>
	);
}

function TableHead({
	className,
	align = "left",
	...props
}: Omit<React.ComponentProps<"th">, "align"> & { align?: Align }) {
	return (
		<th
			data-slot="table-head"
			className={cn(
				"h-9 px-3 py-2 align-middle whitespace-nowrap text-sm font-semibold text-text-secondary first:pl-5",
				alignClass[align],
				className,
			)}
			{...props}
		/>
	);
}

function TableCell({
	className,
	align = "left",
	state = "default",
	...props
}: Omit<React.ComponentProps<"td">, "align"> & { align?: Align; state?: "default" | "error" | "warning" }) {
	return (
		<td
			data-slot="table-cell"
			data-state={state !== "default" ? state : undefined}
			className={cn(
				"px-3 py-2 align-middle text-sm tabular-nums text-text-primary first:pl-5",
				state === "error" && "bg-surface-error-subtle",
				state === "warning" && "bg-surface-warning-subtle",
				alignClass[align],
				className,
			)}
			{...props}
		/>
	);
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
	return <caption data-slot="table-caption" className={cn("mt-2 text-xs text-text-secondary", className)} {...props} />;
}

/** Skeleton rows for the loading state. Skeletons, not spinners, for content areas. */
function TableLoadingRows({ columns, rows = 5 }: { columns: number; rows?: number }) {
	return (
		<>
			{Array.from({ length: rows }, (_, row) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows have no identity and never reorder
				<tr key={row} className="border-b border-border-default last:border-0" aria-hidden>
					{Array.from({ length: columns }, (_, col) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: placeholder cells have no identity and never reorder
						<td key={col} className="px-3 py-3 first:pl-5">
							<Skeleton className={cn("h-4", col === 0 ? "w-3/4" : "w-1/2")} />
						</td>
					))}
				</tr>
			))}
		</>
	);
}

/** One cell across every column, for the empty and error states. */
function TableFullRow({ columns, children }: { columns: number; children: React.ReactNode }) {
	return (
		<tr>
			<td colSpan={columns} className="px-5">
				{children}
			</td>
		</tr>
	);
}

export { Table, TableBody, TableCaption, TableCell, TableFullRow, TableHead, TableHeader, TableLoadingRows, TableRow };
