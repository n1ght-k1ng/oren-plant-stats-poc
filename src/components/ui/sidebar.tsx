/** Sidebar: 240 px expanded, 64 px collapsed, and a left drawer below 768 px. */
import { PanelLeft } from "lucide-react";
import Link from "next/link";
import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

type SidebarCtx = {
	expanded: boolean;
	setExpanded: (value: boolean) => void;
	mobileOpen: boolean;
	setMobileOpen: (value: boolean) => void;
};

const SidebarContext = React.createContext<SidebarCtx | null>(null);

export function useSidebar() {
	const ctx = React.useContext(SidebarContext);
	if (!ctx) {
		throw new Error("useSidebar must be used within a SidebarProvider");
	}
	return ctx;
}

/** True inside the mobile drawer, where labels always show. */
const InDrawerContext = React.createContext(false);

/** Labels show when the sidebar is expanded, and always in the mobile drawer. */
export function useShowLabels() {
	const inDrawer = React.useContext(InDrawerContext);
	const ctx = React.useContext(SidebarContext);
	return inDrawer || (ctx?.expanded ?? true);
}

export function SidebarProvider({
	defaultExpanded = true,
	children,
}: { defaultExpanded?: boolean; children: React.ReactNode }) {
	const [expanded, setExpanded] = React.useState(defaultExpanded);
	const [mobileOpen, setMobileOpen] = React.useState(false);
	const value = React.useMemo(() => ({ expanded, setExpanded, mobileOpen, setMobileOpen }), [expanded, mobileOpen]);
	return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function Sidebar({ className, children }: { className?: string; children: React.ReactNode }) {
	const { expanded, mobileOpen, setMobileOpen } = useSidebar();
	return (
		<>
			<aside
				aria-label="Sidebar"
				data-expanded={expanded}
				data-testid="sidebar-root"
				className={cn(
					"sticky top-0 z-[1] hidden h-screen shrink-0 flex-col overflow-hidden border-r md:flex",
					"border-border-default bg-surface-sidebar transition-[width] duration-200 ease-out motion-reduce:transition-none",
					expanded ? "w-[240px]" : "w-[64px]",
					className,
				)}
			>
				{children}
			</aside>
			<DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
				<DialogPrimitive.Portal>
					<DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-surface-overlay md:hidden" />
					<DialogPrimitive.Content
						aria-label="Sidebar"
						className="fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col bg-surface-sidebar shadow-lg outline-none md:hidden"
					>
						<DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
						<InDrawerContext.Provider value>{children}</InDrawerContext.Provider>
					</DialogPrimitive.Content>
				</DialogPrimitive.Portal>
			</DialogPrimitive.Root>
		</>
	);
}

export function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
	const show = useShowLabels();
	return (
		<div
			className={cn(
				"flex h-14 shrink-0 items-center border-b border-border-default",
				show ? "gap-3 px-4" : "justify-center",
				className,
			)}
			{...props}
		/>
	);
}

export function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("oren-scrollbar-v3 min-h-0 flex-1 overflow-y-auto px-2", className)} {...props} />;
}

export function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn("flex shrink-0 flex-col gap-3 border-t border-border-default px-2 py-3", className)}
			{...props}
		/>
	);
}

export function SidebarGroup({ label, children }: { label?: string; children: React.ReactNode }) {
	const show = useShowLabels();
	return (
		<div className="flex flex-col gap-1 py-2">
			{label && show && (
				<div className="truncate px-3 py-2 text-xs font-medium tracking-wider text-text-secondary select-none">
					{label}
				</div>
			)}
			<ul className="m-0 flex list-none flex-col gap-0.5 p-0">{children}</ul>
		</div>
	);
}

export function SidebarMenuButton({
	href,
	icon: Icon,
	label,
	active = false,
	badge,
	"data-testid": testId,
}: {
	href: string;
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	active?: boolean;
	badge?: React.ReactNode;
	"data-testid"?: string;
}) {
	const show = useShowLabels();
	const { setMobileOpen } = useSidebar();
	return (
		<li className="list-none">
			<Link
				href={href}
				data-testid={testId}
				aria-current={active ? "page" : undefined}
				title={show ? undefined : label}
				onClick={() => setMobileOpen(false)}
				className={cn(
					"group/btn inline-flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm select-none",
					"transition-[color,background-color,transform] duration-[120ms] active:scale-[0.98]",
					"outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1",
					"[&_svg]:transition-transform [&_svg]:duration-[120ms] hover:[&_svg]:-translate-y-px",
					active
						? "bg-grey font-medium text-interactive-primary"
						: "text-gray600 hover:bg-surface-sidebar-hover hover:text-text-primary",
					!show && "justify-center px-0",
				)}
			>
				<Icon className="size-[18px] shrink-0" />
				{show && <span className="min-w-0 flex-1 truncate">{label}</span>}
				{show && badge != null && (
					<span className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-surface-muted px-1.5 text-xs font-medium text-gray600">
						{badge}
					</span>
				)}
			</Link>
		</li>
	);
}

/** Collapses the sidebar on desktop; opens the drawer on phones. */
export function SidebarTrigger({ className }: { className?: string }) {
	const { expanded, setExpanded, setMobileOpen } = useSidebar();
	return (
		<button
			type="button"
			data-testid="sidebar-trigger"
			aria-label="Toggle navigation"
			title="Toggle navigation"
			onClick={() => {
				if (window.matchMedia("(min-width: 768px)").matches) {
					setExpanded(!expanded);
				} else {
					setMobileOpen(true);
				}
			}}
			className={cn(
				"inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors duration-[120ms]",
				"hover:bg-surface-sidebar-hover hover:text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
				className,
			)}
		>
			<PanelLeft className="size-4" aria-hidden />
		</button>
	);
}
