import { AlertTriangle, ArrowLeft, SearchX, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactNode } from "react";

import { AppLayout } from "@/components/layout/AppLayout";
import { EditPlantDialog } from "@/components/plants/EditPlantDialog";
import { PlantTypeBadge } from "@/components/plants/PlantTypeBadge";
import { RecentChanges } from "@/components/plants/RecentChanges";
import { formatCapacity } from "@/components/plants/capacity";
import { OrenButton } from "@/components/ui/OrenButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	EmptyState,
	EmptyStateActions,
	EmptyStateDescription,
	EmptyStateIcon,
	EmptyStateTitle,
} from "@/components/ui/empty-state";
import {
	PageHeader,
	PageHeaderActions,
	PageHeaderDescription,
	PageHeaderHeading,
	PageHeaderRow,
} from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLES, hasRole } from "@/lib/roles";
import { PLANT_TYPE_LABELS } from "@/lib/schemas/plant";
import { api } from "@/utils/api";

function BackToPlants() {
	return (
		<Link
			href="/plants"
			className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-link hover:text-text-link-hover"
			data-testid="plant-back"
		>
			<ArrowLeft className="size-4" aria-hidden />
			All plants
		</Link>
	);
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
			<dt className="w-40 shrink-0 text-sm text-text-secondary">{label}</dt>
			<dd className="text-sm text-text-primary">{children}</dd>
		</div>
	);
}

export default function PlantPage() {
	const router = useRouter();
	const id = typeof router.query.id === "string" ? router.query.id : "";
	const me = api.session.me.useQuery();
	const plant = api.plant.byId.useQuery({ id }, { enabled: id !== "", retry: false });
	const canEdit = me.data ? hasRole(me.data, ROLES.SUSTAINABILITY_HEAD) : false;

	if (plant.isError && plant.error.data?.code === "NOT_FOUND") {
		return (
			<AppLayout title="Plant">
				<EmptyState>
					<EmptyStateIcon icon={SearchX} />
					<EmptyStateTitle>We could not find this plant</EmptyStateTitle>
					<EmptyStateDescription>It may have been removed, or the link may be wrong.</EmptyStateDescription>
					<EmptyStateActions>
						<OrenButton
							variant="secondary"
							data-testid="plant-not-found-back"
							onClick={() => void router.push("/plants")}
						>
							Back to Plants
						</OrenButton>
					</EmptyStateActions>
				</EmptyState>
			</AppLayout>
		);
	}

	if (plant.isError) {
		return (
			<AppLayout title="Plant">
				<EmptyState>
					<EmptyStateIcon icon={AlertTriangle} />
					<EmptyStateTitle>We could not load this plant</EmptyStateTitle>
					<EmptyStateDescription>Check your connection, then try again.</EmptyStateDescription>
					<EmptyStateActions>
						<OrenButton data-testid="plant-retry" onClick={() => void plant.refetch()}>
							Try Again
						</OrenButton>
					</EmptyStateActions>
				</EmptyState>
			</AppLayout>
		);
	}

	if (!plant.data) {
		return (
			<AppLayout title="Plant">
				<div className="flex flex-col gap-3" aria-busy>
					<Skeleton className="h-8 w-80" />
					<Skeleton className="h-4 w-64" />
					<Skeleton className="mt-4 h-40 w-full" />
					<Skeleton className="h-40 w-full" />
				</div>
			</AppLayout>
		);
	}

	const data = plant.data;
	return (
		<AppLayout title={`${data.code} ${data.name}`}>
			<BackToPlants />
			<PageHeader bordered>
				<PageHeaderRow>
					<div className="flex flex-col gap-1">
						<PageHeaderHeading>{data.name}</PageHeaderHeading>
						<PageHeaderDescription>
							{data.code} · {PLANT_TYPE_LABELS[data.type]} · {data.town}, {data.state}
						</PageHeaderDescription>
					</div>
					{canEdit && (
						<PageHeaderActions>
							<EditPlantDialog plant={data} />
						</PageHeaderActions>
					)}
				</PageHeaderRow>
			</PageHeader>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Details</CardTitle>
					</CardHeader>
					<CardContent>
						<dl className="flex flex-col gap-3">
							<DetailRow label="Code">{data.code}</DetailRow>
							<DetailRow label="Type">
								<PlantTypeBadge type={data.type} />
							</DetailRow>
							<DetailRow label="Town">{data.town}</DetailRow>
							<DetailRow label="State">{data.state}</DetailRow>
							<DetailRow label="Cement capacity">{formatCapacity(data.cementCapacityTpa)}</DetailRow>
						</dl>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Data owners</CardTitle>
					</CardHeader>
					<CardContent>
						{data.dataOwners.length === 0 ? (
							<EmptyState className="py-6">
								<EmptyStateIcon icon={Users} />
								<EmptyStateTitle>No data owner yet</EmptyStateTitle>
								<EmptyStateDescription>Nobody is responsible for this plant's data.</EmptyStateDescription>
							</EmptyState>
						) : (
							<ul className="flex flex-col gap-3" data-testid="plant-data-owners">
								{data.dataOwners.map((owner) => (
									<li key={owner.id} className="flex flex-col">
										<span className="text-sm font-medium text-text-primary">{owner.name}</span>
										<span className="text-xs text-text-secondary">{owner.email}</span>
									</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>

				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle>Recent changes</CardTitle>
					</CardHeader>
					<CardContent>
						<RecentChanges changes={data.recentChanges} />
					</CardContent>
				</Card>
			</div>
		</AppLayout>
	);
}
