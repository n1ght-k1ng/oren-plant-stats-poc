/** PageHeader: heading, description and actions at the top of a page. */
import type * as React from "react";

import { cn } from "@/lib/utils";

function PageHeader({ bordered, className, ...props }: React.ComponentProps<"div"> & { bordered?: boolean }) {
	return (
		<div
			className={cn("flex flex-col gap-1 pb-6", bordered && "mb-6 border-b border-border-default", className)}
			{...props}
		/>
	);
}

function PageHeaderRow({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)} {...props} />
	);
}

function PageHeaderHeading({ className, ...props }: React.ComponentProps<"h1">) {
	return (
		<h1 className={cn("text-2xl leading-8 font-semibold tracking-[-0.01em] text-text-primary", className)} {...props} />
	);
}

function PageHeaderDescription({ className, ...props }: React.ComponentProps<"p">) {
	return <p className={cn("text-sm leading-5 text-text-secondary", className)} {...props} />;
}

function PageHeaderActions({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("flex shrink-0 items-center gap-2", className)} {...props} />;
}

export { PageHeader, PageHeaderActions, PageHeaderDescription, PageHeaderHeading, PageHeaderRow };
