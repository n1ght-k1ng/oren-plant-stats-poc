import { AlertTriangle, ClipboardList } from "lucide-react";
import { useRouter } from "next/router";
import toast from "react-hot-toast";

import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/months/StatusBadge";
import { PlantTypeBadge } from "@/components/plants/PlantTypeBadge";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { periodLabel } from "@/lib/periods";
import { api } from "@/utils/api";

/** Flow 1: the months a data owner can enter, for each plant they own data for. */
export default function MyMonthsPage() {
	const router = useRouter();
	const mine = api.month.mine.useQuery();
	const open = api.month.open.useMutation({
		onSuccess: ({ reportId }) => void router.push(`/months/${reportId}`),
		onError: (error) => toast.error(error.message || "We could not open this month. Please try again."),
	});

	return (
		<AppLayout title="Monthly data">
			<PageHeader bordered>
				<PageHeaderHeading>Monthly data</PageHeaderHeading>
				<PageHeaderDescription>
					Enter each month's fuel, power and clinker for your plants, then submit it for review.
				</PageHeaderDescription>
			</PageHeader>

			{mine.isLoading && (
				<div className="flex flex-col gap-3" aria-busy>
					<Skeleton className="h-12 w-full" />
					<Skeleton className="h-64 w-full" />
				</div>
			)}

			{mine.isError && (
				<EmptyState>
					<EmptyStateIcon icon={AlertTriangle} />
					<EmptyStateTitle>We could not load your months</EmptyStateTitle>
					<EmptyStateDescription>Check your connection, then try again.</EmptyStateDescription>
					<EmptyStateActions>
						<OrenButton data-testid="months-retry" onClick={() => void mine.refetch()}>
							Try Again
						</OrenButton>
					</EmptyStateActions>
				</EmptyState>
			)}

			{mine.data?.length === 0 && (
				<EmptyState>
					<EmptyStateIcon icon={ClipboardList} />
					<EmptyStateTitle>You don't enter data for any plant</EmptyStateTitle>
					<EmptyStateDescription>
						Only a plant's data owners enter its months. Switch to a data owner from the top bar to try it.
					</EmptyStateDescription>
				</EmptyState>
			)}

			<div className="flex flex-col gap-6">
				{mine.data?.map(({ plant, months }) => (
					<Card key={plant.id} data-testid={`months-plant-${plant.code}`}>
						<CardHeader className="flex flex-row flex-wrap items-center gap-3">
							<CardTitle>
								{plant.code} {plant.name}
							</CardTitle>
							<PlantTypeBadge type={plant.type} />
						</CardHeader>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Month</TableHead>
									<TableHead>Status</TableHead>
									<TableHead align="right">
										<span className="sr-only">Action</span>
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{months.map((month) => {
									const opening =
										open.isLoading && open.variables?.period === month.period && open.variables.plantId === plant.id;
									return (
										<TableRow key={month.period} data-testid={`month-row-${plant.code}-${month.period}`}>
											<TableCell className="font-medium">{periodLabel(month.period)}</TableCell>
											<TableCell>
												<StatusBadge status={month.status} />
											</TableCell>
											<TableCell align="right">
												{month.reportId ? (
													<OrenButton
														size="sm"
														variant={month.status === "DRAFT" || month.status === "RETURNED" ? "solid" : "secondary"}
														onClick={() => void router.push(`/months/${month.reportId}`)}
														data-testid={`month-open-${plant.code}-${month.period}`}
													>
														{month.status === "DRAFT"
															? "Continue"
															: month.status === "RETURNED"
																? "Fix and Resubmit"
																: "View"}
													</OrenButton>
												) : (
													<OrenButton
														size="sm"
														variant="secondary"
														isLoading={opening}
														disabled={open.isLoading}
														onClick={() => open.mutate({ plantId: plant.id, period: month.period })}
														data-testid={`month-start-${plant.code}-${month.period}`}
													>
														Start
													</OrenButton>
												)}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</Card>
				))}
			</div>
		</AppLayout>
	);
}
