import { Check, ChevronDown, LogOut } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import toast from "react-hot-toast";

import { homeFor } from "@/lib/home";
import { roleLabels } from "@/lib/roles";
import type { SessionUser } from "@/lib/schemas/session";
import { describeUser, groupByCompany } from "@/lib/users";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

const itemClass = cn(
	"flex w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-left outline-none select-none",
	"data-[highlighted]:bg-surface-muted data-[highlighted]:ring-2 data-[highlighted]:ring-inset data-[highlighted]:ring-border-focus",
	"data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
);

/** Top-bar menu to act as another sample user, or sign out. */
export function UserSwitcher({ user }: { user: SessionUser }) {
	const users = api.session.users.useQuery();
	const switchUser = api.session.switchUser.useMutation({
		onSuccess: (switched) => window.location.assign(homeFor(switched)),
		onError: () => toast.error("We could not switch user. Please try again."),
	});
	const signOut = api.session.signOut.useMutation({
		onSuccess: () => window.location.assign("/sign-in"),
	});

	return (
		<DropdownMenu.Root>
			<DropdownMenu.Trigger asChild>
				<button
					type="button"
					data-testid="user-switcher"
					className={cn(
						"inline-flex items-center gap-2 rounded-lg px-2 py-1 text-right outline-none",
						"hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-border-focus",
					)}
				>
					<span className="flex flex-col leading-tight">
						<span className="text-sm font-medium text-text-primary">{user.name}</span>
						<span className="text-xs text-text-secondary">
							{roleLabels(user.roles)} · {user.companyName}
						</span>
					</span>
					<ChevronDown className="size-4 text-text-secondary" aria-hidden />
				</button>
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				<DropdownMenu.Content
					align="end"
					sideOffset={6}
					className="z-[60] max-h-[70vh] w-96 overflow-y-auto rounded-lg border-[1.5px] border-border-default bg-surface-card p-1 shadow-md"
				>
					<DropdownMenu.Label className="px-3 py-2 text-xs text-text-secondary">
						Act as another sample user
					</DropdownMenu.Label>
					{groupByCompany(users.data ?? []).map(([companyName, members]) => (
						<DropdownMenu.Group key={companyName}>
							<DropdownMenu.Label className="px-3 pt-2 pb-1 text-xs font-semibold text-text-primary">
								{companyName}
							</DropdownMenu.Label>
							{members.map((member) => (
								<DropdownMenu.Item
									key={member.id}
									className={itemClass}
									disabled={switchUser.isLoading}
									data-testid={`user-switcher-${member.email}`}
									onSelect={() => {
										if (member.id !== user.id) {
											switchUser.mutate({ userId: member.id });
										}
									}}
								>
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="truncate text-sm text-text-primary">{member.name}</span>
										<span className="truncate text-xs text-text-secondary">{describeUser(member)}</span>
									</span>
									{member.id === user.id && (
										<Check className="size-4 text-interactive-primary" aria-label="Current user" />
									)}
								</DropdownMenu.Item>
							))}
						</DropdownMenu.Group>
					))}
					<DropdownMenu.Separator className="my-1 h-px bg-border-default" />
					<DropdownMenu.Item
						className={itemClass}
						data-testid="user-switcher-sign-out"
						onSelect={() => signOut.mutate()}
					>
						<LogOut className="size-4 text-text-secondary" aria-hidden />
						<span className="text-sm text-text-primary">Sign out</span>
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	);
}
