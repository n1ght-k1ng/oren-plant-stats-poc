import { AlertTriangle, ClipboardList, Factory, Flame } from "lucide-react";
import { useRouter } from "next/router";
import { type ReactNode, useEffect } from "react";

import { UserSwitcher } from "@/components/layout/UserSwitcher";
import { OrenButton } from "@/components/ui/OrenButton";
import { AppShell, AppShellContent, AppShellMain, TopBar } from "@/components/ui/app-shell";
import {
	EmptyState,
	EmptyStateActions,
	EmptyStateDescription,
	EmptyStateIcon,
	EmptyStateTitle,
} from "@/components/ui/empty-state";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarHeader,
	SidebarMenuButton,
	SidebarTrigger,
	useShowLabels,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/utils/api";

const NAV_ITEMS = [
	{ href: "/months", label: "Monthly data", icon: ClipboardList },
	{ href: "/plants", label: "Plants", icon: Factory },
	{ href: "/factors", label: "Emission factors", icon: Flame },
];

function Brand() {
	const showLabel = useShowLabels();
	return (
		<>
			<span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-brand text-sm font-bold text-text-on-brand">
				O
			</span>
			{showLabel && <span className="truncate text-sm font-semibold text-text-primary">Plant data</span>}
		</>
	);
}

/** The signed-in app frame. Sends anyone without a session to the user picker. */
export function AppLayout({ title, children }: { title: string; children: ReactNode }) {
	const router = useRouter();
	const utils = api.useContext();
	const me = api.session.me.useQuery();
	const isSignedOut = me.isSuccess && me.data === null;

	useEffect(() => {
		if (isSignedOut) {
			void router.replace("/sign-in");
		}
	}, [isSignedOut, router]);

	return (
		<AppShell>
			<Sidebar>
				<SidebarHeader>
					<Brand />
				</SidebarHeader>
				<SidebarContent>
					<SidebarGroup>
						{NAV_ITEMS.map((item) => (
							<SidebarMenuButton
								key={item.href}
								href={item.href}
								icon={item.icon}
								label={item.label}
								active={router.pathname.startsWith(item.href)}
								data-testid={`nav-${item.href.slice(1)}`}
							/>
						))}
					</SidebarGroup>
				</SidebarContent>
			</Sidebar>
			<AppShellMain>
				<TopBar>
					<SidebarTrigger />
					<span className="min-w-0 flex-1 truncate text-sm font-medium text-text-secondary">{title}</span>
					{me.data ? <UserSwitcher user={me.data} /> : <Skeleton className="h-9 w-48" />}
				</TopBar>
				<AppShellContent>
					{me.isError ? (
						<EmptyState>
							<EmptyStateIcon icon={AlertTriangle} />
							<EmptyStateTitle>We could not load the app</EmptyStateTitle>
							<EmptyStateDescription>Check your connection, then try again.</EmptyStateDescription>
							<EmptyStateActions>
								<OrenButton data-testid="app-retry" onClick={() => void utils.invalidate()}>
									Try Again
								</OrenButton>
							</EmptyStateActions>
						</EmptyState>
					) : me.data ? (
						children
					) : (
						<div className="flex flex-col gap-3" aria-busy>
							<Skeleton className="h-8 w-64" />
							<Skeleton className="h-4 w-96" />
							<Skeleton className="mt-4 h-64 w-full" />
						</div>
					)}
				</AppShellContent>
			</AppShellMain>
		</AppShell>
	);
}
