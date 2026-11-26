import { AlertTriangle, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";

import { OrenButton } from "@/components/ui/OrenButton";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
	EmptyState,
	EmptyStateActions,
	EmptyStateDescription,
	EmptyStateIcon,
	EmptyStateTitle,
} from "@/components/ui/empty-state";
import { PageHeader, PageHeaderDescription, PageHeaderHeading } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { homeFor } from "@/lib/home";
import { describeUser, groupByCompany } from "@/lib/users";
import { api } from "@/utils/api";

export default function SignInPage() {
	const users = api.session.users.useQuery();
	const switchUser = api.session.switchUser.useMutation({
		onSuccess: (user) => window.location.assign(homeFor(user)),
		onError: () => toast.error("We could not sign you in as this user. Please try again."),
	});

	return (
		<main className="min-h-screen bg-surface-page px-4 py-12">
			<div className="mx-auto flex max-w-2xl flex-col gap-6">
				<PageHeader className="pb-0">
					<PageHeaderHeading>Choose a user</PageHeaderHeading>
					<PageHeaderDescription>
						This app uses sample logins instead of a real sign-in. Pick who you want to act as. You can switch at any
						time from the top bar.
					</PageHeaderDescription>
				</PageHeader>

				{users.isLoading && (
					<div className="flex flex-col gap-3" aria-busy>
						<Skeleton className="h-14 w-full" />
						<Skeleton className="h-14 w-full" />
						<Skeleton className="h-14 w-full" />
					</div>
				)}

				{users.isError && (
					<EmptyState>
						<EmptyStateIcon icon={AlertTriangle} />
						<EmptyStateTitle>We could not load the users</EmptyStateTitle>
						<EmptyStateDescription>Check your connection, then try again.</EmptyStateDescription>
						<EmptyStateActions>
							<OrenButton data-testid="sign-in-retry" onClick={() => void users.refetch()}>
								Try Again
							</OrenButton>
						</EmptyStateActions>
					</EmptyState>
				)}

				{users.data && users.data.length === 0 && (
					<EmptyState>
						<EmptyStateIcon icon={AlertTriangle} />
						<EmptyStateTitle>No users yet</EmptyStateTitle>
						<EmptyStateDescription>Run npm run db:seed to add the sample users, then reload.</EmptyStateDescription>
					</EmptyState>
				)}

				{groupByCompany(users.data ?? []).map(([companyName, members]) => (
					<Card key={companyName}>
						<CardHeader>
							<CardTitle>{companyName}</CardTitle>
						</CardHeader>
						<ul className="divide-y divide-border-default">
							{members.map((member) => (
								<li key={member.id}>
									<button
										type="button"
										disabled={switchUser.isLoading}
										onClick={() => switchUser.mutate({ userId: member.id })}
										data-testid={`sign-in-${member.email}`}
										className="flex w-full items-center gap-3 px-5 py-3 text-left outline-none hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus disabled:cursor-wait"
									>
										<span className="flex min-w-0 flex-1 flex-col">
											<span className="text-sm font-medium text-text-primary">{member.name}</span>
											<span className="truncate text-xs text-text-secondary">{describeUser(member)}</span>
										</span>
										<ChevronRight className="size-4 shrink-0 text-text-secondary" aria-hidden />
									</button>
								</li>
							))}
						</ul>
					</Card>
				))}
			</div>
		</main>
	);
}
