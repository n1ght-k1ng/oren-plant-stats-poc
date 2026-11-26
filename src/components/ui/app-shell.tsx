/** AppShell: the shell fills the viewport; only AppShellContent scrolls. */
import type * as React from "react";

import { SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

function AppShell({
	defaultExpanded = true,
	className,
	...props
}: React.ComponentProps<"div"> & { defaultExpanded?: boolean }) {
	return (
		<SidebarProvider defaultExpanded={defaultExpanded}>
			<div className={cn("flex h-screen overflow-hidden bg-surface-card", className)} {...props} />
		</SidebarProvider>
	);
}

function AppShellMain({ className, ...props }: React.ComponentProps<"main">) {
	return <main className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", className)} {...props} />;
}

function AppShellContent({ className, style, ...props }: React.ComponentProps<"div">) {
	// `contain: layout` stops a tall child from creating a whole-page scrollbar.
	return (
		<div
			className={cn("min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6", className)}
			style={{ contain: "layout", ...style }}
			{...props}
		/>
	);
}

/** 56 px bar above the content: sidebar trigger and breadcrumb left, actions right. */
function TopBar({ className, ...props }: React.ComponentProps<"header">) {
	return (
		<header
			className={cn(
				"flex h-14 shrink-0 items-center gap-3 border-b border-border-default bg-surface-card px-4",
				className,
			)}
			{...props}
		/>
	);
}

export { AppShell, AppShellContent, AppShellMain, TopBar };
